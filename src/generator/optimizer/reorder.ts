import type { Block, Stmt } from '../ir/types.ts';

export function reorder(block: Block): Block {
  const ifs: Stmt[] = [];
  const foreach: Stmt[] = [];
  const rest: Stmt[] = [];

  for (const stmt of block) {
    if (stmt.kind === 'if') {
      ifs.push(stmt);
    } else if (stmt.kind === 'foreach') {
      foreach.push(stmt);
    } else {
      rest.push(stmt);
    }
  }

  return [...ifs, ...foreach, ...rest];
}
