import type { Block, Stmt } from '../ir/types.ts';
import { stmtEquals } from '../ir/equals.ts';

export function dedupe(block: Block): Block {
  const out: Stmt[] = [];
  for (const stmt of block) {
    if (stmt.kind === 'if' || stmt.kind === 'foreach') {
      const dup = out.some((s) => stmtEquals(s, stmt));
      if (!dup) {
        out.push(stmt);
      }
      continue;
    }
    out.push(stmt);
  }
  return out;
}
