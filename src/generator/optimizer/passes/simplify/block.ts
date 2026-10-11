import { blockEquals } from '../../../ir/equals.ts';
import type { BlockPass } from '../../pass.ts';
import { simplify } from './expression.ts';

/** Block-level simplify fixpoint (after known facts, before DCE). */
export const simplifyPass: BlockPass = {
  id: 'simplify',
  run(block, ctx) {
    let current = block;
    let transformingPasses = 0;
    let converged = false;
    for (let i = 0; i < ctx.params.maxOptimizationLoops; i++) {
      const next = simplify(current, ctx.params, ctx);
      if (blockEquals(current, next)) {
        converged = true;
        break;
      }
      transformingPasses++;
      current = next;
    }
    if (!converged) {
      ctx.stats.noteSimplifyFixpointCapped();
    }
    ctx.stats.noteSimplifyCall(transformingPasses);
    return current;
  },
};
