import { blockEquals } from '../../../ir/equals.ts';
import type { BlockPass } from '../../pass.ts';
import { withScope } from '../../trace/commit.ts';
import { simplify } from './expression.ts';

/** Block-level simplify fixpoint (after known facts, before DCE). */
export const simplifyPass: BlockPass = {
  id: 'simplify',
  run(block, ctx, pos) {
    let current = block;
    let currentPos = withScope(pos, block);
    let transformingPasses = 0;
    let converged = false;
    for (let i = 0; i < ctx.params.maxOptimizationLoops; i++) {
      const next = simplify(current, ctx.params, ctx, currentPos);
      if (blockEquals(current, next.block)) {
        converged = true;
        break;
      }
      transformingPasses++;
      current = next.block;
      currentPos = next.pos;
    }
    if (!converged) {
      ctx.stats.noteSimplifyFixpointCapped();
    }
    ctx.stats.noteSimplifyCall(transformingPasses);
    return { block: current, pos: currentPos };
  },
};
