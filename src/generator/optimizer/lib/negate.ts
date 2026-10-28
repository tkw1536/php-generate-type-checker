import type { Block, Expr, Stmt } from '../../ir/types.ts';
import { notExpr, returnStmt } from '../../ir/index.ts';
import { blockStep, exprStep } from '../trace/rewrite.ts';
import type { TraceStepReason } from '../trace/types.ts';

export type NegateBlockResult = {
  readonly block: Block;
  readonly children: readonly TraceStepReason[];
};

/** Negate a block, returning the body and nested `inline.negate` proof steps. */
export function negateBlockTraced(block: Block): NegateBlockResult {
  const parts = block.map((stmt) => negateStmtTraced(stmt));
  return {
    block: parts.map((p) => p.stmt),
    children: parts.flatMap((p) => p.children),
  };
}

function negateStmtTraced(stmt: Stmt): {
  readonly stmt: Stmt;
  readonly children: readonly TraceStepReason[];
} {
  switch (stmt.kind) {
    case 'return': {
      const before = stmt.expr;
      const after: Expr = notExpr(before);
      return {
        stmt: returnStmt(after),
        children: [exprStep('inline.negate', before, after, [])],
      };
    }
    case 'if': {
      const nested = negateBlockTraced(stmt.body);
      return {
        stmt: { ...stmt, body: nested.block },
        children: [
          blockStep(
            'inline.negate',
            stmt.body,
            nested.block,
            nested.children,
          ),
        ],
      };
    }
    case 'foreach': {
      const nested = negateBlockTraced(stmt.body);
      return {
        stmt: { ...stmt, body: nested.block },
        children: [
          blockStep(
            'inline.negate',
            stmt.body,
            nested.block,
            nested.children,
          ),
        ],
      };
    }
    default:
      throw new Error('never reached');
  }
}
