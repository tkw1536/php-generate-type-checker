import type { Expr } from '../../../ir/types.ts';
import { andExpr, boolLit, notExpr, orExpr } from '../../../ir/index.ts';
import { expandBinOps } from '../simplify/binOps.ts';

/**
 * Canonical form for known-fact store/match: expand negative bins to
 * `!(positive)`, then push `not` through `&&` / `||`.
 */
export function canonicalizeFactExpr(expr: Expr): Expr {
  return pushNots(expandBinOps(expr));
}

function pushNots(expr: Expr): Expr {
  switch (expr.kind) {
    case 'not': {
      const inner = pushNots(expr.expr);
      if (inner.kind === 'bool') {
        return boolLit(!inner.value);
      }
      if (inner.kind === 'not') {
        return pushNots(inner.expr);
      }
      if (inner.kind === 'and') {
        return pushNots(orExpr(inner.exprs.map(notExpr)));
      }
      if (inner.kind === 'or') {
        return pushNots(andExpr(inner.exprs.map(notExpr)));
      }
      return inner === expr.expr ? expr : { kind: 'not', expr: inner };
    }
    case 'and':
      return andExpr(expr.exprs.map(pushNots));
    case 'or':
      return orExpr(expr.exprs.map(pushNots));
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
