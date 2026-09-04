import type { CheckerIR } from '../ir/types.ts';

/** Internal optimizer configuration (not exposed on public API yet). */
export type OptimizerParams = {
  /** Program names kept in IR even with zero incoming call_checker refs. */
  readonly neverPrune: ReadonlySet<string>;
  /** Outer IR fixpoint + inner per-block phase/inline loop cap. */
  readonly maxOptimizationLoops: number;
  /** Cap for normalizeExpr fixpoint inside simplifyExpression. */
  readonly maxExpressionSimplificationLoops: number;
};

export function createOptimizerParams(ir: CheckerIR): OptimizerParams {
  const roots =
    ir.entries.length > 0
      ? ir.entries
      : ir.order[0] === undefined
        ? []
        : [ir.order[0]];
  return {
    neverPrune: new Set(roots),
    maxOptimizationLoops: 8,
    maxExpressionSimplificationLoops: 32,
  };
}
