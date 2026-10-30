/**
 * Theory rule and rewrite rule shapes for the saturating PHP-fact prover.
 */
import type { Expr } from '../../ir/types.ts';
import type { ExprPattern, Subst } from './pattern.types.ts';

/**
 * Leaf implication rule ids — Trace uses `facts.imply.${TheoryRuleId}`
 * (and env seeds use `facts.env.${EnvSeededTheoryRuleId}`).
 */
export type TheoryRuleId =
  | 'exclusive'
  | 'instanceofObject'
  | 'isAClassExists'
  | 'emptyArrayCount'
  | 'arrayKeyExistsNonEmpty'
  | 'arrayKeyExistsCountNonZero'
  | 'countPositiveNonEmpty'
  | 'notKey0NotListOrEmpty'
  | 'listHigherKeyExists'
  | 'equalityType';

/** Fixed conclusion templates, or generative schemas for finite families. */
export type TheoryConclusion =
  | { readonly kind: 'pattern'; readonly pattern: ExprPattern }
  | {
      readonly kind: 'exclusiveNegations';
      /** Arg var holding the subject. */
      readonly subject: string;
      /** When set, skip this exclusive call name (the known-true tag). */
      readonly skipCallName?: string;
      /** When true, also skip emitting ¬($x === null) (known-null tag). */
      readonly skipNull?: boolean;
    }
  | {
      readonly kind: 'keysBelow';
      readonly subject: string;
      readonly n: string;
    }
  | {
      readonly kind: 'equalityTypeCall';
      readonly subject: string;
      readonly lit: string;
    };

export type TheoryRule = {
  readonly id: TheoryRuleId;
  readonly premises: readonly ExprPattern[];
  readonly conclusions: readonly TheoryConclusion[];
  readonly guard?: (subst: Subst) => boolean;
};

export type FactDerivation =
  | { readonly kind: 'seed' }
  | { readonly kind: 'andSplit'; readonly parent: Expr }
  | {
      readonly kind: 'rule';
      readonly ruleId: TheoryRuleId;
      readonly premises: readonly Expr[];
    };

export type SaturatedFact = {
  readonly expr: Expr;
  readonly how: FactDerivation;
};

export type RewriteRuleId =
  | 'facts.normalize.countEmpty'
  | 'facts.normalize.listCountKeyExists'
  | 'facts.normalize.listNonEmptyKey0';

/**
 * Syntax rewrite under env-proven requirements — same Pattern matcher as
 * implications, but replaces the matched expr instead of adding facts.
 */
export type RewriteRule = {
  readonly id: RewriteRuleId;
  readonly match: ExprPattern;
  readonly replace: ExprPattern;
  /** Instantiated patterns that must be provable true in the fact env. */
  readonly require?: readonly ExprPattern[];
  readonly guard?: (subst: Subst) => boolean;
};
