import { blockEquals } from '../../../ir/equals.ts';
import type { BlockPass } from '../../pass.ts';
import { simplify } from './expression.ts';

/** Block-level simplify fixpoint (after known facts, before DCE). */
export const simplifyPass: BlockPass = {
  id: 'simplify',
  run(block, ctx) {
    let current = block;
    let transformingPasses = 0;
    for (let i = 0; i < ctx.params.maxOptimizationLoops; i++) {
      const next = simplify(current, ctx.params, ctx);
      if (blockEquals(current, next)) {
        break;
      }
      transformingPasses++;
      current = next;
    }
    ctx.stats.noteSimplifyCall(transformingPasses);
    return current;
  },
};
