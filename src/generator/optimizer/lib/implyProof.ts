import type { Arg, Expr } from '../../ir/types.ts';
import { andExpr, callExpr, orExpr } from '../../ir/index.ts';
import { equals } from '../../ir/equals.ts';
import type {
  AbsorbDropProof,
  EntailProof,
  ImplyProof,
} from '../proof/types.ts';
import {
  exclusiveTypeImplies,
  typeCallImpliedByEquality,
} from './exclusiveTypes.ts';
import { arrayEmptyImplyProof } from './implyArrayEmpty.ts';

function isTrueLiteralArg(arg: Arg): boolean {
  return (
    arg.kind === 'literal' && (arg.value === 'true' || arg.value === 'TRUE')
  );
}

/** `is_a($x, T::class, TRUE)` subject, or null if not that shape. */
function isAAllowStringSubject(expr: Expr): Arg | null {
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

/** Direct A ⇒ B rules (no AND/OR decomposition). */
function leafImplyProof(a: Expr, b: Expr): ImplyProof | null {
  if (equals(a, b)) {
    return { kind: 'refl' };
  }
  const isASubject = isAAllowStringSubject(a);
  if (
    isASubject !== null &&
    equals(callExpr('class_exists', [isASubject]), b)
  ) {
    return { kind: 'isAClassExists' };
  }
  if (
    a.kind === 'instanceof' &&
    equals(callExpr('is_object', [a.subject]), b)
  ) {
    return { kind: 'instanceofObject' };
  }
  const arrayEmpty = arrayEmptyImplyProof(a, b);
  if (arrayEmpty !== null) {
    return arrayEmpty;
  }
  if (exclusiveTypeImplies(a, b)) {
    return { kind: 'exclusive' };
  }
  return null;
}

/** Reconstructible A ⇒ B, or null. */
export function implyProof(a: Expr, b: Expr): ImplyProof | null {
  const leaf = leafImplyProof(a, b);
  if (leaf !== null) {
    return leaf;
  }
  // `$x instanceof T` ⇒ whatever follows from `is_object($x)` (exclusive ¬is_array, …).
  if (a.kind === 'instanceof') {
    const isObject = callExpr('is_object', [a.subject]);
    const via = implyProof(isObject, b);
    if (via !== null) {
      return { kind: 'instanceofObject', via };
    }
  }
  const litType = typeCallImpliedByEquality(a);
  if (litType !== null) {
    const via = implyProof(litType, b);
    if (via !== null) {
      return { kind: 'equalityType', via };
    }
  }
  if (a.kind === 'and') {
    for (const c of a.exprs) {
      const via = implyProof(c, b);
      if (via !== null) {
        return { kind: 'andConjunct', conjunct: c, via };
      }
    }
    // e.g. list ∧ key_exists(N) ⇒ key_exists(k) for k < N.
    const andCover = arrayEmptyImplyProof(a, b);
    if (andCover !== null) {
      return andCover;
    }
  }
  if (b.kind === 'or') {
    for (const d of b.exprs) {
      const via = implyProof(a, d);
      if (via !== null) {
        return { kind: 'orDisjunct', disjunct: d, via };
      }
    }
    // e.g. ¬key_exists(0) ⇒ ¬list ∨ empty when both appear among disjuncts.
    const cover = arrayEmptyImplyProof(a, b);
    if (cover !== null) {
      return cover;
    }
  }
  return null;
}

/** Reconstructible premise ⊨ conclusion, or null. */
export function entailProof(
  premise: Expr,
  conclusion: Expr,
): EntailProof | null {
  const imply = implyProof(premise, conclusion);
  if (imply !== null) {
    return { kind: 'byImplies', imply };
  }
  if (premise.kind === 'or') {
    if (premise.exprs.length === 0) {
      return null;
    }
    const cases: EntailProof[] = [];
    for (const d of premise.exprs) {
      const c = entailProof(d, conclusion);
      if (c === null) {
        return null;
      }
      cases.push(c);
    }
    return { kind: 'orCases', cases };
  }
  if (premise.kind === 'and') {
    for (const c of premise.exprs) {
      const via = entailProof(c, conclusion);
      if (via !== null) {
        return { kind: 'andPick', conjunct: c, via };
      }
    }
  }
  return null;
}

function pairwiseAbsorbDrop(
  candidate: Expr,
  other: Expr,
  mode: 'and' | 'or',
): AbsorbDropProof | null {
  if (equals(candidate, other)) {
    return null;
  }
  if (mode === 'or') {
    const imply = implyProof(candidate, other);
    if (imply === null) {
      return null;
    }
    return { from: candidate, to: other, how: { kind: 'structural', imply } };
  }
  const imply = implyProof(other, candidate);
  if (imply === null) {
    return null;
  }
  return { from: other, to: candidate, how: { kind: 'structural', imply } };
}

/** OR: drop A when A ⇒ (∨ others), e.g. ¬key_exists(0) under ¬list ∨ empty. */
function orCoverAbsorbDrop(
  candidate: Expr,
  exprs: readonly Expr[],
  index: number,
): AbsorbDropProof | null {
  if (exprs.length < 3) {
    return null;
  }
  const others = exprs.filter((_, j) => j !== index);
  const cover = orExpr(others);
  const imply = implyProof(candidate, cover);
  if (imply === null) {
    return null;
  }
  return { from: candidate, to: cover, how: { kind: 'structural', imply } };
}

/** AND: drop B when (∧ others) ⇒ B, e.g. key_exists(k) under list ∧ key_exists(N). */
function andCoverAbsorbDrop(
  candidate: Expr,
  exprs: readonly Expr[],
  index: number,
): AbsorbDropProof | null {
  if (exprs.length < 3) {
    return null;
  }
  const others = exprs.filter((_, j) => j !== index);
  const cover = andExpr(others);
  const imply = implyProof(cover, candidate);
  if (imply === null) {
    return null;
  }
  return { from: cover, to: candidate, how: { kind: 'structural', imply } };
}

/**
 * Drop operands made redundant by implication, with proofs for each drop.
 * - OR: drop stronger A when weaker B is present (A ⇒ B)
 * - AND: drop weaker B when stronger A is present (A ⇒ B)
 */
export function absorbImpliedOperandsProof(
  exprs: readonly Expr[],
  mode: 'and' | 'or',
): {
  readonly exprs: Expr[];
  readonly drops: readonly AbsorbDropProof[];
} {
  const kept: Expr[] = [];
  const drops: AbsorbDropProof[] = [];
  for (let i = 0; i < exprs.length; i++) {
    const candidate = exprs[i];
    let drop: AbsorbDropProof | null = null;
    for (let j = 0; j < exprs.length; j++) {
      if (i === j) {
        continue;
      }
      drop = pairwiseAbsorbDrop(candidate, exprs[j], mode);
      if (drop !== null) {
        break;
      }
    }
    if (drop === null && mode === 'or') {
      drop = orCoverAbsorbDrop(candidate, exprs, i);
    }
    if (drop === null && mode === 'and') {
      drop = andCoverAbsorbDrop(candidate, exprs, i);
    }
    if (drop === null) {
      kept.push(candidate);
    } else {
      drops.push(drop);
    }
  }
  return { exprs: kept, drops };
}
