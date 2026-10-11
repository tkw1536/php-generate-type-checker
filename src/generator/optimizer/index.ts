import type { CheckerIR } from '../ir/types.ts';
import { runOptimize } from './driver.ts';
import type { OptimizeResult } from './stats/types.ts';

/** Optimize IR; always returns stats and a fine-grained rewrite trace. */
export function optimize(ir: CheckerIR): OptimizeResult {
  return runOptimize(ir);
}
