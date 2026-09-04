import type { Block, Expr, Stmt } from '../ir/types.ts';
import { equals } from '../ir/equals.ts';
import {
  absorbBinOp,
  absorbBinOps,
  expandBinOp,
  expandBinOps,
  negateBinOp,
} from './binOps.ts';
import { normalizeExpr } from './normalize.ts';
import type { OptimizerParams } from './params.ts';

export {
  absorbBinOp,
  absorbBinOps,
  expandBinOp,
  expandBinOps,
  negateBinOp,
};

export function simplify(block: Block, params: OptimizerParams): Block {
  return block.map((stmt) => simplifyStatement(stmt, params));
}

function simplifyStatement(stmt: Stmt, params: OptimizerParams): Stmt {
  switch (stmt.kind) {
    case 'if':
      return {
        kind: 'if',
        cond: simplifyExpression(stmt.cond, params),
        body: simplify(stmt.body, params),
      };
    case 'foreach':
      return {
        ...stmt,
        body: simplify(stmt.body, params),
      };
    case 'return':
      return {
        kind: 'return',
        expr: simplifyExpression(stmt.expr, params),
      };
    default:
      return stmt;
  }
}

export function simplifyExpression(expr: Expr, params: OptimizerParams): Expr {
  let current = expandBinOps(expr);
  for (let i = 0; i < params.maxExpressionSimplificationLoops; i++) {
    const next = normalizeExpr(current);
    if (equals(current, next)) {
      break;
    }
    current = next;
  }
  return absorbBinOps(current);
}
