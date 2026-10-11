import type { Expr } from '../generator/ir/types.ts';
import { renderTraceSnapshot } from '../generator/optimizer/trace/render.ts';
import type {
  OptimizeTraceSnapshot,
  TraceScopeSnapshot,
  TraceStep,
} from '../generator/optimizer/trace/types.ts';
import { assignTempNames } from '../generator/render/refs.ts';
import { renderExpr } from '../generator/render/phpExpr.ts';

/** Temp names from the checker body at render time (never stored on steps). */
export function stepTempNames(
  step: TraceStep,
): ReadonlyMap<number, string> | undefined {
  const snap = step.checker.after.kind === 'block'
    ? step.checker.after
    : step.checker.before.kind === 'block'
      ? step.checker.before
      : null;
  if (snap === null) {
    return undefined;
  }
  return assignTempNames({ body: snap.block });
}

/** Render a focus/scope snapshot with UI-assigned temp names. */
export function renderEventSnapshot(
  snap: OptimizeTraceSnapshot | TraceScopeSnapshot,
  tempNames: ReadonlyMap<number, string> | undefined,
): string {
  return renderTraceSnapshot(snap, tempNames);
}

/** Render an IR expr with the same temp names as the Diff pane. */
export function renderEventExpr(
  expr: Expr,
  tempNames?: ReadonlyMap<number, string>,
): string {
  return renderExpr(expr, { tempNames });
}
