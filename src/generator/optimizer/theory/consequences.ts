/**
 * Eager consequences of a known-true expr for fact-env seeding.
 * Structural AND/OR/NOT bookkeeping stays in env.derive*; this only runs
 * PHP semantic Horn rules.
 */
import type { Expr } from '../../ir/types.ts';
import { equals } from '../../ir/equals.ts';
import { saturate } from './saturate.ts';
import type { TheoryRuleId } from './types.ts';

export type TheoryConsequence = {
  readonly expr: Expr;
  readonly ruleId: TheoryRuleId;
};

/**
 * Facts that follow from knowing `seed` is true (excluding the seed itself
 * and pure AND-split fragments that are not rule conclusions).
 */
export function consequencesFromTrue(seed: Expr): readonly TheoryConsequence[] {
  const sat = saturate([seed]);
  const out: TheoryConsequence[] = [];
  for (const fact of sat.facts) {
    if (fact.how.kind !== 'rule') {
      continue;
    }
    if (equals(fact.expr, seed)) {
      continue;
    }
    out.push({ expr: fact.expr, ruleId: fact.how.ruleId });
  }
  return out;
}
