import type { Block, Stmt } from '../ir/types.ts';
import { stmtEquals } from '../ir/equals.ts';

export function dedupe(block: Block): Block {
  const out: Stmt[] = [];
  for (const stmt of block) {
    if (stmt.kind !== 'if') {
      out.push(stmt);
      continue;
    }
    const dup = out.some(
      (s) => s.kind === 'if' && stmtEquals(s, stmt),
    );
    if (!dup) {
      out.push(stmt);
    }
  }
  return out;
}
