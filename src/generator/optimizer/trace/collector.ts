import type { Block, CheckerIR, CheckerProgram, Expr } from '../../ir/types.ts';
import { assignTempNames } from '../../render/refs.ts';
import type { OptimizeContext } from '../context.ts';
import { attachScopeTempNames, attachTempNames } from './attachTemp.ts';
import { exprApply, exprSnapshots } from './exprRecord.ts';
import { applyBlockRewrite, replaceExprInBlock } from './replaceExpr.ts';
import { scopeSnapEquals } from './snapEquals.ts';
import type {
  OptimizeTraceDetail,
  OptimizeTraceEvent,
  OptimizeTraceRuleId,
  OptimizeTraceSnapshot,
  TraceScopeSnapshot,
} from './types.ts';

type RecordInput = {
  readonly rule: OptimizeTraceRuleId;
  readonly detail?: OptimizeTraceDetail;
  readonly focus: {
    readonly before: OptimizeTraceSnapshot;
    readonly after: OptimizeTraceSnapshot;
  };
  readonly scope: {
    readonly before: TraceScopeSnapshot;
    readonly after: TraceScopeSnapshot;
  };
  readonly checker: {
    readonly before: TraceScopeSnapshot;
    readonly after: TraceScopeSnapshot;
  };
};

/** Append-only fine-grained rewrite log for one optimize run. */
export class TraceCollector {
  private readonly events: OptimizeTraceEvent[] = [];
  private ctx: Readonly<OptimizeContext> | null = null;

  bind(ctx: Readonly<OptimizeContext>): void {
    this.ctx = ctx;
  }

  record(input: Readonly<RecordInput>): void {
    const ctx = this.ctx;
    if (ctx === null) {
      throw new Error('trace collector not bound');
    }
    const tempNames = ctx.tempNames;
    this.events.push({
      index: this.events.length,
      rule: input.rule,
      program: ctx.program,
      outerLoop: ctx.outerLoop,
      blockLoop: ctx.blockLoop,
      detail: input.detail ?? { kind: 'none' },
      focus: {
        before: attachTempNames(input.focus.before, tempNames),
        after: attachTempNames(input.focus.after, tempNames),
      },
      scope: {
        before: attachScopeTempNames(input.scope.before, tempNames),
        after: attachScopeTempNames(input.scope.after, tempNames),
      },
      checker: {
        before: attachScopeTempNames(input.checker.before, tempNames),
        after: attachScopeTempNames(input.checker.after, tempNames),
      },
    });
  }

  /**
   * Block-level rewrite: focus and scope are the same before/after blocks.
   * Skips ghosts (no checker-level change).
   */
  recordBlock(
    rule: OptimizeTraceRuleId,
    before: Block,
    after: Block,
    detail?: OptimizeTraceDetail,
  ): void {
    const ctx = this.requireCtx();
    const beforeSnap = blockSnap(before);
    const afterSnap = blockSnap(after);
    const checker = checkerFromBlockRewrite(ctx, before, after);
    if (scopeSnapEquals(checker.before, checker.after)) {
      return;
    }
    this.record({
      rule,
      detail,
      focus: { before: beforeSnap, after: afterSnap },
      scope: { before: beforeSnap, after: afterSnap },
      checker,
    });
    // Compose into live frames so later records in this pass see this rewrite.
    ctx.mapEnclosingBlocks((block) => applyBlockRewrite(block, before, after));
  }

  /** IR-level rewrite (prune). Skips ghosts. */
  recordIr(
    rule: OptimizeTraceRuleId,
    before: CheckerIR,
    after: CheckerIR,
    detail?: OptimizeTraceDetail,
  ): void {
    const beforeSnap: TraceScopeSnapshot = { kind: 'ir', ir: before };
    const afterSnap: TraceScopeSnapshot = { kind: 'ir', ir: after };
    if (scopeSnapEquals(beforeSnap, afterSnap)) {
      return;
    }
    this.record({
      rule,
      detail,
      focus: { before: beforeSnap, after: afterSnap },
      scope: { before: beforeSnap, after: afterSnap },
      checker: { before: beforeSnap, after: afterSnap },
    });
  }

  /**
   * Expr-level rewrite: focus is the expr pair; scope is the enclosing block
   * with the old expr in place vs the block with that expr replaced.
   * Checker is the full program body with the same replacement.
   *
   * When `within` is set, `before` → `after` is applied only inside the first
   * match of that host expression (fact folds must not rewrite other stmts).
   *
   * @returns true when an event was recorded and live frames were updated.
   */
  recordExpr(
    rule: OptimizeTraceRuleId,
    before: Expr,
    after: Expr,
    detail?: OptimizeTraceDetail,
    within?: Expr,
  ): boolean {
    const ctx = this.requireCtx();
    const enclosing = ctx.enclosingBlock;
    const root = ctx.enclosingRoot;
    // Replacing a bool literal would rewrite every TRUE/FALSE in the checker
    // (replace-all) and leave the live IR out of sync with pass return values.
    if (before.kind === 'bool') {
      return false;
    }
    if (!exprRewriteAffectsLiveIr(root, enclosing, before, after)) {
      return false;
    }
    const apply = exprApply(before, after, within);
    const snaps = exprSnapshots(
      enclosing,
      root,
      before,
      after,
      apply,
      blockSnap,
    );
    if (scopeSnapEquals(snaps.checker.before, snaps.checker.after)) {
      return false;
    }
    this.record({ rule, detail, focus: snaps.focus, scope: snaps.scope, checker: snaps.checker });
    ctx.mapEnclosingBlocks((block) => apply(block));
    return true;
  }

  snapshot(): readonly OptimizeTraceEvent[] {
    return this.events.slice();
  }

  /**
   * Ensure every checker in `initial` appears in the trace.
   * Programs with no rewrites get a baseline (unchanged) event showing their
   * initial body. Groups follow `initial.order`, then prune events.
   */
  finalize(initial: CheckerIR): readonly OptimizeTraceEvent[] {
    const byProgram = new Map<string, OptimizeTraceEvent[]>();
    for (const event of this.events) {
      const existing = byProgram.get(event.program);
      if (existing === undefined) {
        byProgram.set(event.program, [event]);
      } else {
        existing.push(event);
      }
    }

    const out: OptimizeTraceEvent[] = [];
    for (const name of initial.order) {
      const existing = byProgram.get(name);
      if (existing !== undefined && existing.length > 0) {
        out.push(...existing);
        continue;
      }
      const program = initial.programs[name];
      if (program === undefined) {
        continue;
      }
      out.push(baselineEvent(name, program));
    }
    const pruneEvents = byProgram.get('(prune)');
    if (pruneEvents !== undefined) {
      out.push(...pruneEvents);
    }
    return out.map((event, index) => Object.assign({}, event, { index }));
  }

  private requireCtx(): Readonly<OptimizeContext> {
    if (this.ctx === null) {
      throw new Error('trace collector not bound');
    }
    return this.ctx;
  }
}

function blockSnap(
  block: Block,
  tempNames: ReadonlyMap<number, string> | null = null,
): TraceScopeSnapshot {
  return { kind: 'block', block, tempNames };
}

function exprRewriteAffectsLiveIr(
  root: Block | null,
  enclosing: Block | null,
  before: Expr,
  after: Expr,
): boolean {
  if (root !== null) {
    return replaceExprInBlock(root, before, after) !== root;
  }
  if (enclosing !== null) {
    return replaceExprInBlock(enclosing, before, after) !== enclosing;
  }
  return true;
}

function baselineEvent(
  program: string,
  checker: CheckerProgram,
): OptimizeTraceEvent {
  const snap = blockSnap(checker.body, assignTempNames(checker));
  return {
    index: 0,
    rule: 'trace.baseline',
    program,
    outerLoop: 0,
    blockLoop: 0,
    detail: { kind: 'none' },
    focus: { before: snap, after: snap },
    scope: { before: snap, after: snap },
    checker: { before: snap, after: snap },
  };
}

function checkerFromBlockRewrite(
  ctx: Readonly<OptimizeContext>,
  before: Block,
  after: Block,
): { readonly before: TraceScopeSnapshot; readonly after: TraceScopeSnapshot } {
  const root = ctx.enclosingRoot;
  if (root === null) {
    return { before: blockSnap(before), after: blockSnap(after) };
  }
  return {
    before: blockSnap(root),
    after: blockSnap(applyBlockRewrite(root, before, after)),
  };
}
