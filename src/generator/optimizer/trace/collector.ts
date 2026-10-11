import type { Block, CheckerIR, CheckerProgram } from '../../ir/types.ts';
import { scopeSnapEquals } from './snapEquals.ts';
import type {
  TraceMeta,
  TraceScopeSnapshot,
  TraceStep,
  TraceStepReason,
} from './types.ts';

type CommitInput = {
  readonly reason: TraceStepReason;
  readonly scope: {
    readonly before: TraceScopeSnapshot;
    readonly after: TraceScopeSnapshot;
  };
  /** Checker (or IR) after this rewrite — before is the program head. */
  readonly after: TraceScopeSnapshot;
};

/** Append-only head-advancing step log for one optimize run. */
export class TraceCollector {
  private readonly steps: TraceStep[] = [];
  /** Per-program checker/IR head (last after). */
  private readonly head = new Map<string, TraceScopeSnapshot>();

  beginProgram(program: string, body: Block): void {
    this.head.set(program, { kind: 'block', block: body });
  }

  beginIr(program: string, ir: CheckerIR): void {
    this.head.set(program, { kind: 'ir', ir });
  }

  /**
   * Commit a rewrite. `checker.before` is the current head; advances head to
   * `after`. Ghosts (before equals after) are skipped except `facts.env.extend`
   * (env-only bookkeeping). Consecutive `facts.env.extend` on the same program
   * are merged into one step (children appended).
   */
  commit(meta: TraceMeta, input: CommitInput): boolean {
    const before = this.head.get(meta.program);
    if (before === undefined) {
      throw new Error(`trace head missing for ${meta.program}`);
    }
    const ghost = scopeSnapEquals(before, input.after);
    if (ghost && input.reason.rule === 'facts.env.extend') {
      if (this.mergeEnvExtend(meta.program, input)) {
        return true;
      }
    } else if (ghost) {
      return false;
    }
    this.steps.push({
      index: this.steps.length,
      program: meta.program,
      outerLoop: meta.outerLoop,
      blockLoop: meta.blockLoop,
      scope: input.scope,
      checker: { before, after: input.after },
      reason: input.reason,
    });
    this.head.set(meta.program, input.after);
    return true;
  }

  /**
   * Append children onto the previous same-program `facts.env.extend`, if that
   * program’s latest step is still an env extend (ignores other programs).
   */
  private mergeEnvExtend(program: string, input: CommitInput): boolean {
    for (let i = this.steps.length - 1; i >= 0; i--) {
      const last = this.steps.at(i);
      if (last === undefined || last.program !== program) {
        continue;
      }
      if (last.reason.rule !== 'facts.env.extend') {
        return false;
      }
      this.steps[i] = {
        ...last,
        scope: {
          before: last.scope.before,
          after: input.scope.after,
        },
        reason: {
          ...last.reason,
          children: [...last.reason.children, ...input.reason.children],
        },
      };
      return true;
    }
    return false;
  }

  snapshot(): readonly TraceStep[] {
    return this.steps.slice();
  }

  /**
   * Ensure every checker in `initial` appears, each starting with a
   * `trace.initial` step (Build IR). Groups follow `initial.order`, then prune.
   */
  finalize(initial: CheckerIR): readonly TraceStep[] {
    const byProgram = new Map<string, TraceStep[]>();
    for (const step of this.steps) {
      const existing = byProgram.get(step.program);
      if (existing === undefined) {
        byProgram.set(step.program, [step]);
      } else {
        existing.push(step);
      }
    }

    const out: TraceStep[] = [];
    for (const name of initial.order) {
      const program = initial.programs[name];
      if (program === undefined) {
        continue;
      }
      out.push(initialStep(name, program));
      const existing = byProgram.get(name);
      if (existing !== undefined) {
        out.push(...existing);
      }
    }
    const pruneSteps = byProgram.get('(prune)');
    if (pruneSteps !== undefined) {
      out.push(...pruneSteps);
    }
    return out.map((step, index) => Object.assign({}, step, { index }));
  }
}

function initialStep(program: string, checker: CheckerProgram): TraceStep {
  const snap: TraceScopeSnapshot = { kind: 'block', block: checker.body };
  return {
    index: 0,
    program,
    outerLoop: 0,
    blockLoop: 0,
    scope: { before: snap, after: snap },
    checker: { before: snap, after: snap },
    reason: {
      kind: 'step',
      rule: 'trace.initial',
      focus: {
        before: { kind: 'block', block: checker.body },
        after: { kind: 'block', block: checker.body },
      },
      children: [],
    },
  };
}
