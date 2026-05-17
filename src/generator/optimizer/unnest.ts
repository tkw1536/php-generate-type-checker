import type { Block, Stmt } from '../ir/types.ts';
import { andExpr } from '../ir/index.ts';

/** `if (a) { if (b) { ... } }` → `if (a && b) { ... }` (repeated while applicable). */
export function unnest(block: Block): Block {
  return block.map((stmt) => unnestStmt(stmt));
}

function unnestStmt(stmt: Stmt): Stmt {
  switch (stmt.kind) {
    case 'if': {
      const conds = [stmt.cond];
      let body: Block = stmt.body;
      while (body.length === 1 && body[0]!.kind === 'if') {
        const inner = body[0]!;
        conds.push(inner.cond);
        body = inner.body;
      }
      const cond = conds.length === 1 ? conds[0]! : andExpr(conds);
      return { kind: 'if', cond, body: unnest(body) };
    }
    case 'foreach':
      return { ...stmt, body: unnest(stmt.body) };
    default:
      return stmt;
  }
}
