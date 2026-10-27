/**
 * Goal-directed queries on top of saturation: implies and entails.
 */
import type { Expr } from '../../ir/types.ts';
import { equals } from '../../ir/equals.ts';
import { canonicalizeFactExpr } from '../passes/facts/canon.ts';
import type { EntailProof, ImplyProof } from '../proof/types.ts';
import { typeCallImpliedByEquality } from '../lib/exclusiveTypes.ts';
import {
  saturate,
  saturationLookup,
  type Saturation,
} from './saturate.ts';
import type { TheoryRuleId } from './types.ts';

function leafRule(ruleId: TheoryRuleId): ImplyProof {
  switch (ruleId) {
    case 'exclusive':
      return { kind: 'exclusive' };
    case 'instanceofObject':
      return { kind: 'instanceofObject' };
    case 'isAClassExists':
      return { kind: 'isAClassExists' };
    case 'emptyArrayCount':
      return { kind: 'emptyArrayCount' };
    case 'arrayKeyExistsNonEmpty':
      return { kind: 'arrayKeyExistsNonEmpty' };
    case 'arrayKeyExistsCountNonZero':
      return { kind: 'arrayKeyExistsCountNonZero' };
    case 'countPositiveNonEmpty':
      return { kind: 'countPositiveNonEmpty' };
    case 'notKey0NotListOrEmpty':
      return { kind: 'notKey0NotListOrEmpty' };
    case 'listHigherKeyExists':
      return { kind: 'listHigherKeyExists' };
    case 'equalityType':
      return { kind: 'equalityType', via: { kind: 'refl' } };
    default:
      throw new Error('never reached');
  }
}

/**
 * Whether every disjunct of `inner` appears among `outer`'s disjuncts
 * (stronger/smaller OR proves weaker/larger OR).
 */
function orDisjunctsSubset(inner: Expr, outer: Expr): boolean {
  const innerParts = inner.kind === 'or' ? inner.exprs : [inner];
  const outerParts = outer.kind === 'or' ? outer.exprs : [outer];
  return innerParts.every((d) => outerParts.some((o) => equals(d, o)));
}

function goalProven(sat: Saturation, goal: Expr): {
  readonly kind: 'fact';
  readonly expr: Expr;
} | {
  readonly kind: 'orWeaken';
  readonly strong: Expr;
} | {
  readonly kind: 'orDisjunct';
  readonly disjunct: Expr;
} | null {
  const canon = canonicalizeFactExpr(goal);
  if (saturationLookup(sat, canon) !== undefined) {
    return { kind: 'fact', expr: canon };
  }
  if (canon.kind === 'or') {
    for (const d of canon.exprs) {
      if (saturationLookup(sat, d) !== undefined) {
        return { kind: 'orDisjunct', disjunct: d };
      }
    }
    for (const fact of sat.facts) {
      if (!equals(fact.expr, canon) && orDisjunctsSubset(fact.expr, canon)) {
        return { kind: 'orWeaken', strong: fact.expr };
      }
    }
  }
  return null;
}

function exclusiveFromSeed(seed: Expr): ImplyProof {
  if (seed.kind === 'instanceof') {
    return { kind: 'instanceofObject', via: { kind: 'exclusive' } };
  }
  if (typeCallImpliedByEquality(seed) !== null) {
    return { kind: 'equalityType', via: { kind: 'exclusive' } };
  }
  if (seed.kind === 'and') {
    for (const c of seed.exprs) {
      if (c.kind === 'instanceof') {
        return {
          kind: 'andConjunct',
          conjunct: c,
          via: { kind: 'instanceofObject', via: { kind: 'exclusive' } },
        };
      }
      if (typeCallImpliedByEquality(c) !== null) {
        return {
          kind: 'andConjunct',
          conjunct: c,
          via: { kind: 'equalityType', via: { kind: 'exclusive' } },
        };
      }
    }
  }
  return { kind: 'exclusive' };
}

/**
 * Explain why saturating `seed` proves `goalFactExpr` (already in the store).
 */
function explainFact(
  seed: Expr,
  goalFactExpr: Expr,
  sat: Saturation,
): ImplyProof {
  const fact = saturationLookup(sat, goalFactExpr);
  if (fact === undefined || fact.how.kind === 'seed') {
    return { kind: 'refl' };
  }
  if (fact.how.kind === 'andSplit') {
    return {
      kind: 'andConjunct',
      conjunct: fact.expr,
      via: { kind: 'refl' },
    };
  }
  if (fact.how.ruleId === 'exclusive') {
    return exclusiveFromSeed(seed);
  }
  return leafRule(fact.how.ruleId);
}

/** Reconstructible A ⇒ B via saturation, or null. */
export function implyProof(a: Expr, b: Expr): ImplyProof | null {
  if (equals(a, b)) {
    return { kind: 'refl' };
  }
  const sat = saturate([a]);
  const proven = goalProven(sat, b);
  if (proven === null) {
    return null;
  }
  switch (proven.kind) {
    case 'fact':
      return explainFact(a, proven.expr, sat);
    case 'orDisjunct':
      return {
        kind: 'orDisjunct',
        disjunct: proven.disjunct,
        via: explainFact(a, proven.disjunct, sat),
      };
    case 'orWeaken':
      return explainFact(a, proven.strong, sat);
    default:
      throw new Error('never reached');
  }
}

/** premise ⊨ conclusion, including OR case-split. */
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
