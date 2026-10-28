import type { Expr } from '../../ir/types.ts';
import type { EnvFact } from '../passes/facts/env.types.ts';
import type { TheoryRuleId } from '../theory/types.ts';

/** Structural imply combinators (not theory Horn rules). */
export type ImplyStructuralId =
  | 'refl'
  | 'andConjunct'
  | 'orDisjunct'
  | 'canon';

/** Leaf id for Trace `facts.imply.${…}` — theory rule or structural combinator. */
export type ImplyLeafId = TheoryRuleId | ImplyStructuralId;

/** Structural A ⇒ B (no env), with leaf steps identified by theory rule id. */
export type ImplyProof =
  | { readonly kind: 'refl' }
  | {
      readonly kind: 'rule';
      readonly ruleId: TheoryRuleId;
      /** Premise chain when the rule fired off a derived fact. */
      readonly via?: ImplyProof;
    }
  | {
      readonly kind: 'andConjunct';
      readonly conjunct: Expr;
      readonly via: ImplyProof;
    }
  | {
      readonly kind: 'orDisjunct';
      readonly disjunct: Expr;
      readonly via: ImplyProof;
    }
  | {
      readonly kind: 'canon';
      readonly before: Expr;
      readonly after: Expr;
      readonly via: ImplyProof;
    };

/** premise ⊨ conclusion, including OR case-split. */
export type EntailProof =
  | { readonly kind: 'byImplies'; readonly imply: ImplyProof }
  | { readonly kind: 'orCases'; readonly cases: readonly EntailProof[] }
  | {
      readonly kind: 'andPick';
      readonly conjunct: Expr;
      readonly via: EntailProof;
    };

/** Justify folding an expr to TRUE/FALSE from env facts. */
export type ProveProof =
  | {
      readonly kind: 'equals';
      readonly fact: EnvFact;
      readonly conclusion: Expr;
      /** Canon when fact/conclusion were matched after canonicalize. */
      readonly canon?: {
        readonly from: Expr;
        readonly to: Expr;
      };
    }
  | {
      readonly kind: 'entails';
      readonly fact: EnvFact;
      readonly conclusion: Expr;
      readonly bridge: EntailProof;
      readonly canon?: {
        readonly from: Expr;
        readonly to: Expr;
      };
    };

/** One operand drop justified by implication. */
export type AbsorbDropProof = {
  readonly from: Expr;
  readonly to: Expr;
  readonly how:
    | { readonly kind: 'structural'; readonly imply: ImplyProof }
    | { readonly kind: 'moduloFacts'; readonly prove: ProveProof };
};
