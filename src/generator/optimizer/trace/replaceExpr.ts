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
 * Replace `from` → `to` only inside the first structural match of `host`
 * (so fact folds do not rewrite the same subexpr in other statements).
 */
export function replaceExprInBlockInsideHost(
  block: Block,
  host: Expr,
  from: Expr,
  to: Expr,
): Block {
  let replacedHost = false;
  const next = block.map((stmt) => {
    if (replacedHost) {
      return stmt;
    }
    const patched = replaceInsideHostInStmt(stmt, host, from, to);
    if (patched !== stmt) {
      replacedHost = true;
    }
    return patched;
  });
  return replacedHost ? next : block;
}

function replaceInsideHostInStmt(
  stmt: Stmt,
  host: Expr,
  from: Expr,
  to: Expr,
): Stmt {
  switch (stmt.kind) {
    case 'if': {
      if (equals(stmt.cond, host)) {
        const cond = replaceExpr(stmt.cond, from, to);
        return cond === stmt.cond
          ? stmt
          : { kind: 'if' as const, cond, body: stmt.body };
      }
      const cond = replaceInsideHostExpr(stmt.cond, host, from, to);
      if (cond !== stmt.cond) {
        return { kind: 'if' as const, cond, body: stmt.body };
      }
      const body = replaceExprInBlockInsideHost(stmt.body, host, from, to);
      return body === stmt.body
        ? stmt
        : { kind: 'if' as const, cond: stmt.cond, body };
    }
    case 'foreach': {
      const body = replaceExprInBlockInsideHost(stmt.body, host, from, to);
      return body === stmt.body ? stmt : { ...stmt, body };
    }
    case 'return': {
      if (equals(stmt.expr, host)) {
        const expr = replaceExpr(stmt.expr, from, to);
        return expr === stmt.expr
          ? stmt
          : { kind: 'return' as const, expr };
      }
      const expr = replaceInsideHostExpr(stmt.expr, host, from, to);
      return expr === stmt.expr
        ? stmt
        : { kind: 'return' as const, expr };
    }
    default:
      throw new Error('never reached');
  }
}

function replaceInsideHostExpr(
  expr: Expr,
  host: Expr,
  from: Expr,
  to: Expr,
): Expr {
  if (equals(expr, host)) {
    return replaceExpr(expr, from, to);
  }
  switch (expr.kind) {
    case 'not': {
      const inner = replaceInsideHostExpr(expr.expr, host, from, to);
      return inner === expr.expr ? expr : { kind: 'not', expr: inner };
    }
    case 'and':
    case 'or': {
      let changed = false;
      let found = false;
      const exprs = expr.exprs.map((e) => {
        if (found) {
          return e;
        }
        if (equals(e, host) || exprContains(e, host)) {
          found = true;
          changed = true;
          return replaceInsideHostExpr(e, host, from, to);
        }
        return e;
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

function exprContains(expr: Expr, host: Expr): boolean {
  if (equals(expr, host)) {
    return true;
  }
  switch (expr.kind) {
    case 'not':
      return exprContains(expr.expr, host);
    case 'and':
    case 'or':
      return expr.exprs.some((e) => exprContains(e, host));
    case 'bool':
    case 'bin':
    case 'call':
    case 'call_checker':
    case 'instanceof':
      return false;
    default:
      throw new Error('never reached');
  }
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
        return { kind: 'if' as const, cond: stmt.cond, body };
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
