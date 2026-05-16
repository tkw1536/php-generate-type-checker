import type { Expr, Stmt } from '../ir/types.ts';
import { andExpr, boolLit, notExpr, orExpr } from '../ir/';

/** Positive guard from `if (not guard) { return false; }` or merged `if (!a || !b) { return false; }`. */
export function parseFailIfGuard(stmt: Stmt): Expr | null {
  if (stmt.kind !== 'if' || stmt.body.length !== 1) {
    return null;
  }
  const inner = stmt.body[0]!;
  if (
    inner.kind !== 'return' ||
    inner.expr.kind !== 'bool' ||
    inner.expr.value !== false
  ) {
    return null;
  }
  if (stmt.cond.kind === 'not') {
    return stmt.cond.expr;
  }
  if (stmt.cond.kind === 'or') {
    const guards: Expr[] = [];
    for (const part of stmt.cond.exprs) {
      if (part.kind !== 'not') {
        return null;
      }
      guards.push(part.expr);
    }
    if (guards.length === 0) {
      return null;
    }
    return guards.length === 1 ? guards[0]! : andExpr(guards);
  }
  return null;
}

export function isFailIfStmt(stmt: Stmt): boolean {
  return parseFailIfGuard(stmt) !== null;
}

/** Merged consecutive fail-if guards as `if (!g1 || !g2 || …) { return false; }`. */
export function failIfOrChainStmt(guards: Expr[]): Stmt {
  return {
    kind: 'if',
    cond: orExpr(guards.map((g) => notExpr(g))),
    body: [{ kind: 'return', expr: boolLit(false) }],
  };
}
