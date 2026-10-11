import type { Expr } from '../generator/ir/types.ts';
import { renderTraceSnapshot } from '../generator/optimizer/trace/render.ts';
import type {
  OptimizeTraceEvent,
  OptimizeTraceSnapshot,
  TraceScopeSnapshot,
} from '../generator/optimizer/trace/types.ts';
import { renderExpr } from '../generator/render/phpExpr.ts';

/** Temp names from the event’s checker/scope (same map Diff uses for the body). */
export function eventTempNames(
  event: OptimizeTraceEvent,
): ReadonlyMap<number, string> | undefined {
  for (const snap of [
    event.checker.before,
    event.checker.after,
    event.scope.before,
    event.scope.after,
  ]) {
    if (snap.kind === 'block' && snap.tempNames !== null) {
      return snap.tempNames;
    }
  }
  return undefined;
}

/** Render a focus/scope snapshot with the event’s temp names for exprs/blocks. */
export function renderEventSnapshot(
  snap: OptimizeTraceSnapshot | TraceScopeSnapshot,
  tempNames: ReadonlyMap<number, string> | undefined,
): string {
  if (snap.kind === 'expr') {
    return renderExpr(snap.expr, { tempNames });
  }
  if (snap.kind === 'block') {
    return renderTraceSnapshot({
      kind: 'block',
      block: snap.block,
      tempNames: snap.tempNames ?? tempNames ?? null,
    });
  }
  return renderTraceSnapshot(snap);
}

/** Render an IR expr with the same temp names as the Diff pane. */
export function renderEventExpr(
  expr: Expr,
  tempNames: ReadonlyMap<number, string> | undefined,
): string {
  return renderExpr(expr, { tempNames });
}
