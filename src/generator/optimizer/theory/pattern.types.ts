/**
 * Pattern AST shapes for theory matching (parallel to checker Expr/Arg).
 */
import type { Arg, BinOp, Expr } from '../../ir/types.ts';

/** Binding produced by a successful match (mutable while matching). */
export type Subst = {
  readonly exprs: Map<string, Expr>;
  readonly args: Map<string, Arg>;
  readonly literals: Map<string, string>;
  readonly ints: Map<string, number>;
};

export type ExprPattern =
  | { readonly kind: 'var'; readonly name: string }
  | { readonly kind: 'any' }
  | { readonly kind: 'bool'; readonly value: boolean }
  | { readonly kind: 'not'; readonly expr: ExprPattern }
  | { readonly kind: 'and'; readonly exprs: readonly ExprPattern[] }
  | { readonly kind: 'or'; readonly exprs: readonly ExprPattern[] }
  | {
      readonly kind: 'call';
      readonly name: string;
      readonly args: readonly ArgPattern[];
    }
  | {
      readonly kind: 'bin';
      readonly op: BinOp;
      readonly left: ArgPattern;
      readonly right: ArgPattern;
      /** When true, === / !== also match swapped operands. */
      readonly commute?: boolean;
    }
  | {
      readonly kind: 'instanceof';
      readonly subject: ArgPattern;
      readonly className: string | null;
    }
  | {
      readonly kind: 'call_checker';
      readonly name: string | null;
      readonly subject: ValueRefPattern;
    };

export type ArgPattern =
  | { readonly kind: 'var'; readonly name: string }
  | { readonly kind: 'any' }
  | { readonly kind: 'lit'; readonly value: string }
  | { readonly kind: 'litVar'; readonly name: string }
  | { readonly kind: 'intLitVar'; readonly name: string }
  | {
      readonly kind: 'call';
      readonly name: string;
      readonly args: readonly ArgPattern[];
    }
  | { readonly kind: 'ref'; readonly ref: ValueRefPattern };

export type ValueRefPattern =
  | { readonly kind: 'var'; readonly name: string }
  | { readonly kind: 'any' }
  | { readonly kind: 'parameter' }
  | { readonly kind: 'variable'; readonly id: number };
