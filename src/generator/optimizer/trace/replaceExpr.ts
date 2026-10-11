import type { Block, Expr, Stmt } from '../../ir/types.ts';
import { blockEquals, equals, stmtEquals } from '../../ir/equals.ts';

/** Replace the first structural match of `from` with `to` inside `expr`. */
export function replaceExpr(expr: Expr, from: Expr, to: Expr): Expr {
  if (equals(expr, from)) {
    return to;
  }
  switch (expr.kind) {
    case 'not': {
      const inner = replaceExpr(expr.expr, from, to);
      return inner === expr.expr ? expr : { kind: 'not', expr: inner };
    }
    case 'and':
    case 'or': {
      let changed = false;
      const exprs = expr.exprs.map((e) => {
        const next = replaceExpr(e, from, to);
        if (next !== e) {
          changed = true;
        }
        return next;
      });
      return changed ? { ...expr, exprs } : expr;
    }
    case 'bool':
    case 'bin':
    case 'call':
    case 'call_checker':
    case 'instanceof':
      return expr;
    default:
      throw new Error('never reached');
  }
}

export function replaceExprInStmt(stmt: Stmt, from: Expr, to: Expr): Stmt {
  switch (stmt.kind) {
    case 'if': {
      const cond = replaceExpr(stmt.cond, from, to);
      const body = replaceExprInBlock(stmt.body, from, to);
      if (cond === stmt.cond && body === stmt.body) {
        return stmt;
      }
      return { kind: 'if', cond, body };
    }
    case 'foreach': {
      const body = replaceExprInBlock(stmt.body, from, to);
      return body === stmt.body ? stmt : { ...stmt, body };
    }
    case 'return': {
      const next = replaceExpr(stmt.expr, from, to);
      return next === stmt.expr ? stmt : { kind: 'return', expr: next };
    }
    default:
      throw new Error('never reached');
  }
}

export function replaceExprInBlock(block: Block, from: Expr, to: Expr): Block {
  let changed = false;
  const next = block.map((stmt) => {
    const replaced = replaceExprInStmt(stmt, from, to);
    if (replaced !== stmt) {
      changed = true;
    }
    return replaced;
  });
  return changed ? next : block;
}

/**
 * Apply a block-level rewrite (`before` → `after`) inside `root`.
 * Matches the whole root, a nested if/foreach body, or a contiguous stmt run.
 */
export function applyBlockRewrite(
  root: Block,
  before: Block,
  after: Block,
): Block {
  if (blockEquals(root, before)) {
    return after;
  }
  const viaSequence = replaceStmtSequence(root, before, after);
  if (!blockEquals(viaSequence, root)) {
    return viaSequence;
  }
  return root;
}

function replaceStmtSequence(
  block: Block,
  before: Block,
  after: Block,
): Block {
  if (before.length > 0) {
    for (let i = 0; i <= block.length - before.length; i++) {
      const matches = before.every((stmt, j) => stmtEquals(stmt, block[i + j]));
      if (matches) {
        return [
          ...block.slice(0, i),
          ...after,
          ...block.slice(i + before.length),
        ];
      }
    }
  }

  let changed = false;
  const next = block.map((stmt) => {
    switch (stmt.kind) {
      case 'if': {
        const body = replaceStmtSequence(stmt.body, before, after);
        if (body === stmt.body) {
          return stmt;
        }
        changed = true;
        return { kind: 'if', cond: stmt.cond, body };
      }
      case 'foreach': {
        const body = replaceStmtSequence(stmt.body, before, after);
        if (body === stmt.body) {
          return stmt;
        }
        changed = true;
        return { ...stmt, body };
      }
      case 'return':
        return stmt;
      default:
        throw new Error('never reached');
    }
  });
  return changed ? next : block;
}
