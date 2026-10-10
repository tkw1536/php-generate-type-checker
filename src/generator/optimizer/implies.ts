import type { Arg, Expr } from '../ir/types.ts';
import { callExpr } from '../ir/index.ts';
import { equals } from '../ir/equals.ts';

function isTrueLiteralArg(arg: Arg): boolean {
  return arg.kind === 'literal' && (arg.value === 'true' || arg.value === 'TRUE');
}

/** `is_a($x, T::class, TRUE)` subject, or null if not that shape. */
export function isAAllowStringSubject(expr: Expr): Arg | null {
  if (
    expr.kind !== 'call' ||
    expr.name !== 'is_a' ||
    expr.args.length !== 3 ||
    !isTrueLiteralArg(expr.args[2])
  ) {
    return null;
  }
  return expr.args[0];
}

function isUnaryTypeCall(expr: Expr, name: string): Arg | null {
  if (expr.kind !== 'call' || expr.name !== name || expr.args.length !== 1) {
    return null;
  }
  return expr.args[0];
}

function exclusiveTypeImplies(a: Expr, b: Expr): boolean {
  const aInt = isUnaryTypeCall(a, 'is_int');
  if (
    aInt !== null &&
    b.kind === 'not' &&
    equals(callExpr('is_string', [aInt]), b.expr)
  ) {
    return true;
  }
  const aString = isUnaryTypeCall(a, 'is_string');
  if (
    aString !== null &&
    b.kind === 'not' &&
    equals(callExpr('is_int', [aString]), b.expr)
  ) {
    return true;
  }
  return false;
}

/** True when knowing `a` is enough to conclude `b`. */
export function implies(a: Expr, b: Expr): boolean {
  if (equals(a, b)) {
    return true;
  }
  const isASubject = isAAllowStringSubject(a);
  if (isASubject !== null && equals(callExpr('class_exists', [isASubject]), b)) {
    return true;
  }
  if (
    a.kind === 'instanceof' &&
    equals(callExpr('is_object', [a.subject]), b)
  ) {
    return true;
  }
  if (exclusiveTypeImplies(a, b)) {
    return true;
  }
  // A && B ⇒ A, A && B ⇒ B (and anything a conjunct implies)
  if (a.kind === 'and' && a.exprs.some((c) => implies(c, b))) {
    return true;
  }
  // A ⇒ A || … (and anything that implies a disjunct)
  if (b.kind === 'or' && b.exprs.some((d) => implies(a, d))) {
    return true;
  }
  return false;
}

/**
 * True when knowing `premise` is enough to conclude `conclusion`,
 * including case-split on a true OR (every disjunct must entail).
 */
export function entails(premise: Expr, conclusion: Expr): boolean {
  if (implies(premise, conclusion)) {
    return true;
  }
  if (premise.kind === 'or') {
    return (
      premise.exprs.length > 0 &&
      premise.exprs.every((d) => entails(d, conclusion))
    );
  }
  if (premise.kind === 'and') {
    return premise.exprs.some((c) => entails(c, conclusion));
  }
  return false;
}

/**
 * Drop operands made redundant by implication:
 * - OR: drop stronger A when weaker B is present (A ⇒ B)
 * - AND: drop weaker B when stronger A is present (A ⇒ B)
 */
export function absorbImpliedOperands(
  exprs: readonly Expr[],
  mode: 'and' | 'or',
): Expr[] {
  return exprs.filter((candidate, i) => {
    for (let j = 0; j < exprs.length; j++) {
      if (i === j) {
        continue;
      }
      const other = exprs[j];
      if (mode === 'or' && implies(candidate, other) && !equals(candidate, other)) {
        return false;
      }
      if (mode === 'and' && implies(other, candidate) && !equals(candidate, other)) {
        return false;
      }
    }
    return true;
  });
}
