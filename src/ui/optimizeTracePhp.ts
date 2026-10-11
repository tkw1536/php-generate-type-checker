import { renderTraceSnapshot } from '../generator/optimizer/trace/render.ts';
import type {
  TraceScopeSnapshot,
  TraceStep,
  TraceStepReason,
} from '../generator/optimizer/trace/types.ts';
import { assignTempNames } from '../generator/render/refs.ts';
import { renderEventSnapshot, stepTempNames } from './optimizeTraceRenderPhp.ts';
import { type PhpDiffResult, phpDiff } from './phpDiff.ts';

/** Wrap a checker body (already indented by formatBody) as a top-level function. */
function wrapAsFunction(name: string, bodyPhp: string): string {
  return `function ${name}(mixed $value): bool\n{\n${bodyPhp}\n}`;
}

/**
 * Render a checker/IR snapshot for Before/After/Diff — always full checker PHP
 * with a function header (display only; functional syntax regardless of output mode).
 */
function renderCheckerViewPhp(
  snap: TraceScopeSnapshot,
  program: string,
): string {
  if (snap.kind === 'ir') {
    const parts: string[] = [];
    for (const name of snap.ir.order) {
      const prog = snap.ir.programs[name];
      if (prog === undefined) {
        continue;
      }
      const body = renderTraceSnapshot(
        { kind: 'block', block: prog.body },
        assignTempNames(prog),
      );
      parts.push(wrapAsFunction(name, body));
    }
    return parts.join('\n\n');
  }
  if (program === '(prune)') {
    return renderTraceSnapshot(snap);
  }
  const temps =
    snap.kind === 'block' ? assignTempNames({ body: snap.block }) : undefined;
  return wrapAsFunction(program, renderTraceSnapshot(snap, temps));
}

/**
 * Before / After / Diff all use the full checker PHP (with function header).
 * Only meaningful for top-level steps.
 */
export function checkerPhpForStep(step: TraceStep): {
  readonly beforePhp: string;
  readonly afterPhp: string;
  readonly diff: PhpDiffResult;
} {
  const beforePhp = renderCheckerViewPhp(step.checker.before, step.program);
  const afterPhp = renderCheckerViewPhp(step.checker.after, step.program);
  return {
    beforePhp,
    afterPhp,
    diff: phpDiff(beforePhp, afterPhp),
  };
}

/** Before / After / Diff for a nested reason’s local focus (expr/block/ir). */
export function focusPhpForReason(
  step: TraceStep,
  reason: TraceStepReason,
): {
  readonly beforePhp: string;
  readonly afterPhp: string;
  readonly diff: PhpDiffResult;
} {
  const temps = stepTempNames(step);
  const beforePhp = renderEventSnapshot(reason.focus.before, temps);
  const afterPhp = renderEventSnapshot(reason.focus.after, temps);
  return {
    beforePhp,
    afterPhp,
    diff: phpDiff(beforePhp, afterPhp),
  };
}
