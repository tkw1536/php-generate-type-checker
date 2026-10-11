import type { Block, Stmt } from '../../ir/types.ts';
import { stmtEquals } from '../../ir/equals.ts';
import type { OptimizeContext } from '../context.ts';
import type { BlockPass, BlockPassResult } from '../pass.ts';
import { commitReason } from '../trace/commit.ts';
import { blockStep } from '../trace/rewrite.ts';
import type { TracePos } from '../trace/types.ts';

export function dedupe(
  block: Block,
  ctx?: Readonly<OptimizeContext>,
  pos?: TracePos,
): BlockPassResult {
  let currentPos = pos ?? { checker: block, scope: block };
  const out: Stmt[] = [];
  for (let i = 0; i < block.length; i++) {
    const stmt = block[i];
    if (stmt.kind === 'if' || stmt.kind === 'foreach') {
      const dup = out.some((s) => stmtEquals(s, stmt));
      if (dup) {
        const before = [...out, stmt, ...block.slice(i + 1)];
        const after = [...out, ...block.slice(i + 1)];
        if (ctx !== undefined) {
          currentPos = commitReason(
            ctx,
            currentPos,
            blockStep('dedupe.drop', before, after),
          );
        }
        continue;
      }
      out.push(stmt);
      continue;
    }
    out.push(stmt);
  }
  return { block: out, pos: currentPos };
}

export const dedupePass: BlockPass = {
  id: 'dedupe',
  run(block, ctx, pos) {
    return dedupe(block, ctx, pos);
  },
};
