import type { Arg, Expr } from '../../ir/types.ts';
import type { EntailProof, ImplyProof } from '../proof/types.ts';
import {
  absorbImpliedOperandsProof,
  entailProof,
  implyProof,
} from './implyProof.ts';

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

/** True when knowing `a` is enough to conclude `b`. */
export function implies(a: Expr, b: Expr): boolean {
  return implyProof(a, b) !== null;
}

/**
 * True when knowing `premise` is enough to conclude `conclusion`,
 * including case-split on a true OR (every disjunct must entail).
 */
export function entails(premise: Expr, conclusion: Expr): boolean {
  return entailProof(premise, conclusion) !== null;
}

/**
 * True when `entails(premise, conclusion)` and the proof uses exclusivity
 * (e.g. `is_int ∨ is_string` entails `¬is_array`).
 */
export function entailsUsesExclusive(
  premise: Expr,
  conclusion: Expr,
): boolean {
  const proof = entailProof(premise, conclusion);
  if (proof === null) {
    return false;
  }
  return entailUsesExclusive(proof);
}

function implyUsesExclusive(p: ImplyProof): boolean {
  switch (p.kind) {
    case 'exclusive':
      return true;
    case 'equalityType':
    case 'andConjunct':
    case 'orDisjunct':
    case 'canon':
      return implyUsesExclusive(p.via);
    case 'refl':
    case 'instanceofObject':
    case 'isAClassExists':
    case 'emptyArrayCount':
    case 'arrayKeyExistsNonEmpty':
    case 'arrayKeyExistsCountNonZero':
    case 'countPositiveNonEmpty':
      return false;
    default:
      throw new Error('never reached');
  }
}

function entailUsesExclusive(p: EntailProof): boolean {
  switch (p.kind) {
    case 'byImplies':
      return implyUsesExclusive(p.imply);
    case 'orCases':
      return p.cases.some(entailUsesExclusive);
    case 'andPick':
      return entailUsesExclusive(p.via);
    default:
      throw new Error('never reached');
  }
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
  return absorbImpliedOperandsProof(exprs, mode).exprs;
}
