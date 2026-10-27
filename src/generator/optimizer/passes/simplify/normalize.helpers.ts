import type { Expr } from '../../../ir/types.ts';
import { andExpr, boolLit, notExpr, orExpr } from '../../../ir/index.ts';
import { equals } from '../../../ir/equals.ts';
import { implyProof } from '../../theory/prove.ts';

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

/** Logical ¬ without stacking `!!x` (cancels one outer `not`). */
function logicalNot(expr: Expr): Expr {
  return expr.kind === 'not' ? expr.expr : notExpr(expr);
}

/** Literal `x` paired with `!x` (used for AND contradiction and OR tautology). */
function hasComplementPair(exprs: readonly Expr[]): boolean {
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

/**
 * AND unsatisfiable: `x && !x`, or exclusive tags / instanceof vs is_* where
 * A ⇒ ¬B (must not be reused for OR — `is_int || is_string` is not a tautology).
 */
export function hasContradiction(exprs: readonly Expr[]): boolean {
  if (hasComplementPair(exprs)) {
    return true;
  }
  for (let i = 0; i < exprs.length; i++) {
    for (let j = i + 1; j < exprs.length; j++) {
      const a = exprs[i];
      const b = exprs[j];
      if (
        implyProof(a, logicalNot(b)) !== null ||
        implyProof(b, logicalNot(a)) !== null
      ) {
        return true;
      }
    }
  }
  return false;
}

/**
 * OR always true: `x || !x`, or when ¬A ⇒ B (equivalently A∨B covers all cases),
 * e.g. `!instanceof || !is_array` because instanceof ⇒ ¬is_array.
 * Must not treat exclusive positives (`is_int || is_string`) as tautologies.
 */
export function hasTautology(exprs: readonly Expr[]): boolean {
  if (hasComplementPair(exprs)) {
    return true;
  }
  for (let i = 0; i < exprs.length; i++) {
    for (let j = i + 1; j < exprs.length; j++) {
      const a = exprs[i];
      const b = exprs[j];
      if (
        implyProof(logicalNot(a), b) !== null ||
        implyProof(logicalNot(b), a) !== null
      ) {
        return true;
      }
    }
  }
  return false;
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
