/**
 * Forward-chaining saturation: seed facts, AND-split, fire Horn rules to a fixpoint.
 */
import type { Expr } from '../../ir/types.ts';
import { equals } from '../../ir/equals.ts';
import { canonicalizeFactExpr } from '../passes/facts/canon.ts';
import { expandConclusion } from './conclusions.ts';
import { emptySubst, matchExpr } from './pattern.ts';
import type { ExprPattern, Subst } from './pattern.types.ts';
import type { FactDerivation, SaturatedFact, TheoryRule } from './types.ts';
import { THEORY_RULES } from './axioms/index.ts';

/** Cap on saturation rounds — loud failure beats silent incomplete closure. */
export const SATURATION_ROUND_CAP = 64;

export type Saturation = {
  readonly facts: readonly SaturatedFact[];
};

/** Mutable fact bag for one saturation run. */
class FactBag {
  readonly #facts: SaturatedFact[] = [];

  get list(): readonly SaturatedFact[] {
    return this.#facts;
  }

  has(expr: Expr): boolean {
    return this.#facts.some((f) => equals(f.expr, expr));
  }

  lookup(expr: Expr): SaturatedFact | undefined {
    return this.#facts.find((f) => equals(f.expr, expr));
  }

  /** @returns true when a new fact was recorded. */
  add(expr: Expr, how: FactDerivation): boolean {
    const canon = canonicalizeFactExpr(expr);
    if (this.has(canon)) {
      return false;
    }
    this.#facts.push({ expr: canon, how });
    return true;
  }
}

/** Flatten ANDs into atomic seeds before rule firing. */
function seedFacts(seeds: readonly Expr[]): FactBag {
  const bag = new FactBag();
  const queue = [...seeds];
  while (queue.length > 0) {
    const expr = queue.shift();
    if (expr === undefined) {
      break;
    }
    const canon = canonicalizeFactExpr(expr);
    if (canon.kind === 'and') {
      for (const c of canon.exprs) {
        if (bag.add(c, { kind: 'andSplit', parent: canon })) {
          queue.push(c);
        }
      }
      continue;
    }
    bag.add(canon, { kind: 'seed' });
  }
  return bag;
}

type PremiseMatch = {
  readonly subst: Subst;
  readonly used: readonly Expr[];
};

/**
 * All substitutions that match every premise against some fact
 * (shared vars unify across premises). Uses a fact snapshot so callers
 * can add conclusions without disturbing the search.
 */
function matchAllPremises(
  premises: readonly ExprPattern[],
  facts: readonly SaturatedFact[],
  guard: ((subst: Subst) => boolean) | undefined,
): readonly PremiseMatch[] {
  const results: PremiseMatch[] = [];
  if (premises.length === 0) {
    const subst = emptySubst();
    if (guard === undefined || guard(subst)) {
      results.push({ subst, used: [] });
    }
    return results;
  }

  function search(index: number, subst: Subst, used: readonly Expr[]): void {
    if (index >= premises.length) {
      if (guard === undefined || guard(subst)) {
        results.push({ subst, used });
      }
      return;
    }
    const pattern = premises[index];
    for (const fact of facts) {
      const next = matchExpr(pattern, fact.expr, subst);
      if (next === null) {
        continue;
      }
      search(index + 1, next, [...used, fact.expr]);
    }
  }

  search(0, emptySubst(), []);
  return results;
}

function fireRule(rule: TheoryRule, bag: FactBag): boolean {
  const snapshot = bag.list;
  let changed = false;
  for (const matched of matchAllPremises(rule.premises, snapshot, rule.guard)) {
    for (const conclusion of rule.conclusions) {
      for (const expr of expandConclusion(conclusion, matched.subst)) {
        if (
          bag.add(expr, {
            kind: 'rule',
            ruleId: rule.id,
            premises: matched.used,
          })
        ) {
          changed = true;
        }
      }
    }
  }
  return changed;
}

/**
 * Close `seeds` under AND-split and the theory rule set.
 * Throws if the round cap is hit (should not happen on generator goldens).
 */
export function saturate(
  seeds: readonly Expr[],
  rules: readonly TheoryRule[] = THEORY_RULES,
): Saturation {
  const bag = seedFacts(seeds);
  for (let round = 0; round < SATURATION_ROUND_CAP; round++) {
    let changed = false;
    for (const rule of rules) {
      if (fireRule(rule, bag)) {
        changed = true;
      }
    }
    if (!changed) {
      return { facts: bag.list };
    }
  }
  throw new Error(
    `theory saturation exceeded ${SATURATION_ROUND_CAP} rounds`,
  );
}

export function saturationHas(sat: Saturation, expr: Expr): boolean {
  const canon = canonicalizeFactExpr(expr);
  return sat.facts.some((f) => equals(f.expr, canon));
}

export function saturationLookup(
  sat: Saturation,
  expr: Expr,
): SaturatedFact | undefined {
  const canon = canonicalizeFactExpr(expr);
  return sat.facts.find((f) => equals(f.expr, canon));
}
