import type { Block, Stmt } from '../../ir/types.ts';
import { stmtEquals } from '../../ir/equals.ts';
import type { OptimizeContext } from '../context.ts';
import type { BlockPass } from '../pass.ts';

export function dedupe(block: Block, ctx?: Readonly<OptimizeContext>): Block {
  const out: Stmt[] = [];
  for (let i = 0; i < block.length; i++) {
    const stmt = block[i];
    if (stmt.kind === 'if' || stmt.kind === 'foreach') {
      const dup = out.some((s) => stmtEquals(s, stmt));
      if (dup) {
        ctx?.trace.recordBlock(
          'dedupe.drop',
          [...out, stmt, ...block.slice(i + 1)],
          [...out, ...block.slice(i + 1)],
        );
        continue;
      }
      out.push(stmt);
      continue;
    }
    out.push(stmt);
  }
  return out;
}

export const dedupePass: BlockPass = {
  id: 'dedupe',
  run(block, ctx) {
    return dedupe(block, ctx);
  },
};
