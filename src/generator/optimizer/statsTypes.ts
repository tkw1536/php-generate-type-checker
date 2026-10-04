import type { CheckerIR } from '../ir/types.ts';

/** Per-pass call / changed counters for one optimize run. */
export type PassStats = {
  readonly calls: number;
  readonly changed: number;
};

export type OptimizerPassName =
  | 'inline'
  | 'dedupe'
  | 'unnest'
  | 'combine'
  | 'flatten'
  | 'facts'
  | 'simplify'
  | 'dce'
  | 'prune';

export type OptimizerPassStats = {
  readonly [K in OptimizerPassName]: PassStats;
};

/** Simplify fixpoint counters. Transforming passes only for max/sum. */
export type SimplifyPhaseStats = {
  readonly calls: number;
  /** Calls where at least one simplify pass changed the block. */
  readonly changed: number;
  readonly maxPasses: number;
  readonly sumPasses: number;
};

export type OptimizerStats = {
  /** Call/changed counts for each optimize.gv pass. */
  readonly passes: OptimizerPassStats;
  /** Block-level simplify fixpoint after known facts (before dce). */
  readonly simplify: SimplifyPhaseStats;
  /** Outer IR fixpoint iterations executed (including the final no-change pass). */
  readonly outerOptimizeLoops: number;
  /** Sum of per-block inline/phase fixpoint iterations across the run. */
  readonly blockOptimizeLoops: number;
};

export type OptimizeWithStatsResult = {
  readonly ir: CheckerIR;
  readonly stats: OptimizerStats;
};
