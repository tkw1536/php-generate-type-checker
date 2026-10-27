/**
 * Absorb redundant AND/OR operands using theory implication.
 */
import type { Expr } from '../../ir/types.ts';
import { andExpr, orExpr } from '../../ir/index.ts';
import { equals } from '../../ir/equals.ts';
import type { AbsorbDropProof } from '../proof/types.ts';
import { implyProof } from './prove.ts';

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
