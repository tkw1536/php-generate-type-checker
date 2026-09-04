import type { Block, Stmt } from '../ir/types.ts';
import { notExpr, returnStmt } from '../ir/index.ts';

export function negateBlock(block: Block): Block {
  return block.map((stmt) => negateStmt(stmt));
}

function negateStmt(stmt: Stmt): Stmt {
  switch (stmt.kind) {
    case 'return':
      return returnStmt(notExpr(stmt.expr));
    case 'if':
      return { ...stmt, body: negateBlock(stmt.body) };
    case 'foreach':
      return { ...stmt, body: negateBlock(stmt.body) };
    default:
      throw new Error('never reached');
  }
}
