import type { CheckerIR } from '../ir/types.ts';

/** Internal optimizer configuration (not exposed on public API yet). */
export type OptimizerParams = {
  /** Program names kept in IR even with zero incoming call_checker refs. */
  neverPrune: ReadonlySet<string>;
  /** Outer IR fixpoint + inner per-block phase/inline loop cap. */
  maxOptimizationLoops: number;
  /** Cap for normalizeExpr fixpoint inside simplifyExpression. */
  maxExpressionSimplificationLoops: number;
};

export function createOptimizerParams(ir: CheckerIR): OptimizerParams {
  const entry = ir.order[0];
  return {
    neverPrune: new Set(entry !== undefined ? [entry] : []),
    maxOptimizationLoops: 8,
    maxExpressionSimplificationLoops: 32,
  };
}
