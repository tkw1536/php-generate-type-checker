import type { Expr } from '../../ir/types.ts';
import type { EnvFact } from '../passes/facts/env.types.ts';

/** Structural A ⇒ B (no env). */
export type ImplyProof =
  | { readonly kind: 'refl' }
  | { readonly kind: 'exclusive' }
  | { readonly kind: 'instanceofObject' }
  | { readonly kind: 'isAClassExists' }
  | { readonly kind: 'emptyArrayCount' }
  /** `array_key_exists($k, $x)` ⇒ `$x !== []`. */
  | { readonly kind: 'arrayKeyExistsNonEmpty' }
  /** `array_key_exists($k, $x)` ⇒ `count($x) !== 0`. */
  | { readonly kind: 'arrayKeyExistsCountNonZero' }
  /** `count($x) === N` (N≥1) ⇒ `$x !== []`. */
  | { readonly kind: 'countPositiveNonEmpty' }
  | { readonly kind: 'equalityType'; readonly via: ImplyProof }
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
