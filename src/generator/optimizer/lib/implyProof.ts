import type { Arg, Expr } from '../../ir/types.ts';
import { binExpr, callArg, callExpr, literalArg } from '../../ir/index.ts';
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

function isTrueLiteralArg(arg: Arg): boolean {
  return (
    arg.kind === 'literal' && (arg.value === 'true' || arg.value === 'TRUE')
  );
}

function isEmptyArrayLiteral(arg: Arg): boolean {
  return arg.kind === 'literal' && arg.value === '[]';
}

/** `$x === []` ⇒ `count($x) === 0`. */
function emptyArrayImpliesCountZero(a: Expr, b: Expr): boolean {
  if (a.kind !== 'bin' || a.op !== '===') {
    return false;
  }
  let subject: Arg | null = null;
  if (isEmptyArrayLiteral(a.right)) {
    subject = a.left;
  } else if (isEmptyArrayLiteral(a.left)) {
    subject = a.right;
  }
  if (subject === null) {
    return false;
  }
  return (
    equals(b, binExpr('===', callArg('count', [subject]), literalArg('0'))) ||
    equals(b, binExpr('===', literalArg('0'), callArg('count', [subject])))
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

/** Reconstructible A ⇒ B, or null. */
export function implyProof(a: Expr, b: Expr): ImplyProof | null {
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
  if (emptyArrayImpliesCountZero(a, b)) {
    return { kind: 'emptyArrayCount' };
  }
  if (exclusiveTypeImplies(a, b)) {
    return { kind: 'exclusive' };
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
  }
  if (b.kind === 'or') {
    for (const d of b.exprs) {
      const via = implyProof(a, d);
      if (via !== null) {
        return { kind: 'orDisjunct', disjunct: d, via };
      }
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
      const other = exprs[j];
      if (equals(candidate, other)) {
        continue;
      }
      if (mode === 'or') {
        const imply = implyProof(candidate, other);
        if (imply !== null) {
          drop = {
            from: candidate,
            to: other,
            how: { kind: 'structural', imply },
          };
          break;
        }
      } else {
        const imply = implyProof(other, candidate);
        if (imply !== null) {
          drop = {
            from: other,
            to: candidate,
            how: { kind: 'structural', imply },
          };
          break;
        }
      }
    }
    if (drop === null) {
      kept.push(candidate);
    } else {
      drops.push(drop);
    }
  }
  return { exprs: kept, drops };
}
