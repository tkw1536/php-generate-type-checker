import type { Expr } from '../../../ir/types.ts';
import { andExpr, boolLit, orExpr } from '../../../ir/index.ts';
import { equals } from '../../../ir/equals.ts';

export function dedupeOperands(exprs: readonly Expr[]): Expr[] {
  const out: Expr[] = [];
  for (const e of exprs) {
    if (!out.some((prev) => equals(prev, e))) {
      out.push(e);
    }
  }
  return out;
}

export function negatedInner(expr: Expr): Expr | null {
  return expr.kind === 'not' ? expr.expr : null;
}

export function hasContradiction(exprs: readonly Expr[]): boolean {
  for (let i = 0; i < exprs.length; i++) {
    for (let j = i + 1; j < exprs.length; j++) {
      const a = exprs[i];
      const b = exprs[j];
      const na = negatedInner(a);
      const nb = negatedInner(b);
      if (na !== null && equals(na, b)) {
        return true;
      }
      if (nb !== null && equals(nb, a)) {
        return true;
      }
    }
  }
  return false;
}

export function hasTautology(exprs: readonly Expr[]): boolean {
  return hasContradiction(exprs);
}

export function flattenAnd(exprs: readonly Expr[]): Expr[] {
  const out: Expr[] = [];
  for (const e of exprs) {
    if (e.kind === 'and') {
      out.push(...flattenAnd(e.exprs));
    } else {
      out.push(e);
    }
  }
  return out;
}

export function flattenOr(exprs: readonly Expr[]): Expr[] {
  const out: Expr[] = [];
  for (const e of exprs) {
    if (e.kind === 'or') {
      out.push(...flattenOr(e.exprs));
    } else {
      out.push(e);
    }
  }
  return out;
}

export function conjunctsOf(expr: Expr): readonly Expr[] {
  if (expr.kind === 'and') {
    return flattenAnd(expr.exprs);
  }
  return [expr];
}

export function disjunctsOf(expr: Expr): readonly Expr[] {
  if (expr.kind === 'or') {
    return flattenOr(expr.exprs);
  }
  return [expr];
}

export function exprInList(expr: Expr, list: readonly Expr[]): boolean {
  return list.some((e) => equals(e, expr));
}

export function intersectOperands(
  armLists: readonly (readonly Expr[])[],
): readonly Expr[] {
  if (armLists.length === 0) {
    return [];
  }
  const [first, ...rest] = armLists;
  return first.filter((operand) =>
    rest.every((arm) => exprInList(operand, arm)),
  );
}

export function subtractOperands(
  arm: readonly Expr[],
  common: readonly Expr[],
): readonly Expr[] {
  return arm.filter((operand) => !common.some((c) => equals(c, operand)));
}

export function remainderAndExpr(remainder: readonly Expr[]): Expr {
  if (remainder.length === 0) {
    return boolLit(true);
  }
  if (remainder.length === 1) {
    return remainder[0];
  }
  return andExpr(remainder);
}

export function remainderOrExpr(remainder: readonly Expr[]): Expr {
  if (remainder.length === 0) {
    return boolLit(false);
  }
  if (remainder.length === 1) {
    return remainder[0];
  }
  return orExpr(remainder);
}

export function allRemaindersEmpty(
  armLists: readonly (readonly Expr[])[],
  common: readonly Expr[],
): boolean {
  return armLists.every((arm) => subtractOperands(arm, common).length === 0);
}

export function factorOrOfAnds(
  exprs: readonly Expr[],
): Extract<Expr, { kind: 'and' }> | null {
  if (exprs.length < 2) {
    return null;
  }
  const armLists = exprs.map((expr) => conjunctsOf(expr));
  const common = intersectOperands(armLists);
  if (common.length === 0) {
    return null;
  }
  const remainders = armLists.map((arm) => subtractOperands(arm, common));
  // When any arm is exactly the shared conjuncts (empty remainder),
  // (C∧R₁) ∨ … ∨ (C∧Rₖ) ∨ C ≡ C — do not build or(…, true) from empty
  // remainders or normalizeOr will drop other arms' constraints unsoundly.
  if (remainders.some((r) => r.length === 0)) {
    return { kind: 'and', exprs: common };
  }
  const remainderOr = orExpr(remainders.map((r) => remainderAndExpr(r)));
  return { kind: 'and', exprs: [...common, remainderOr] };
}

export function factorAndOfOrs(
  exprs: readonly Expr[],
): Extract<Expr, { kind: 'or' }> | null {
  if (exprs.length < 2) {
    return null;
  }
  const armLists = exprs.map((expr) => disjunctsOf(expr));
  const common = intersectOperands(armLists);
  if (common.length === 0) {
    return null;
  }
  if (allRemaindersEmpty(armLists, common)) {
    return { kind: 'or', exprs: common };
  }
  const remainderAnd = andExpr(
    armLists.map((arm) => remainderOrExpr(subtractOperands(arm, common))),
  );
  return { kind: 'or', exprs: [...common, remainderAnd] };
}
