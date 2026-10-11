import type { Block, Stmt } from '../../ir/types.ts';
import { blockEquals } from '../../ir/equals.ts';
import { orExpr } from '../../ir/index.ts';
import type { OptimizeContext } from '../context.ts';
import type { BlockPass } from '../pass.ts';

export function combine(block: Block, ctx?: Readonly<OptimizeContext>): Block {
  const out: Stmt[] = [];
  let i = 0;
  while (i < block.length) {
    const stmt = block[i];
    if (stmt.kind !== 'if') {
      out.push(stmt);
      i++;
      continue;
    }
    const sharedBody = stmt.body;
    const conds = [stmt.cond];
    let j = i + 1;
    while (j < block.length) {
      const next = block[j];
      if (next.kind !== 'if' || !blockEquals(next.body, sharedBody)) {
        break;
      }
      conds.push(next.cond);
      j++;
    }
    if (conds.length === 1) {
      out.push(stmt);
    } else {
      const merged: Stmt = {
        kind: 'if',
        cond: orExpr(conds),
        body: sharedBody,
      };
      const before = [...out, ...block.slice(i)];
      const after = [...out, merged, ...block.slice(j)];
      ctx?.trace.recordBlock('combine.merge', before, after);
      out.push(merged);
    }
    i = j;
  }
  return out;
}

export const combinePass: BlockPass = {
  id: 'combine',
  run(block, ctx) {
    return combine(block, ctx);
  },
};
