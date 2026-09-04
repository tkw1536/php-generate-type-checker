/**
 * Checker IR: PHP-shaped AST for generated checker function bodies.
 */
export type ValueRef =
  | { readonly kind: 'variable'; readonly name: string }
  | { readonly kind: 'array_access'; readonly object: ValueRef; readonly key: string | number }
  | { readonly kind: 'property_access'; readonly object: ValueRef; readonly name: string };

export type BinOp = '===' | '!==' | '==' | '!=' | '>' | '<' | '>=' | '<=';

export type Arg =
  | { readonly kind: 'ref'; readonly ref: ValueRef }
  | { readonly kind: 'literal'; readonly value: string }
  | { readonly kind: 'call'; readonly name: string; readonly args: readonly Arg[] };

export type Expr =
  | { readonly kind: 'bool'; readonly value: boolean }
  | { readonly kind: 'not'; readonly expr: Expr }
  | { readonly kind: 'and'; readonly exprs: readonly Expr[] }
  | { readonly kind: 'or'; readonly exprs: readonly Expr[] }
  | { readonly kind: 'call'; readonly name: string; readonly args: readonly Arg[] }
  | { readonly kind: 'bin'; readonly op: BinOp; readonly left: Arg; readonly right: Arg }
  | { readonly kind: 'instanceof'; readonly subject: Arg; readonly className: string }
  | { readonly kind: 'call_checker'; readonly name: string; readonly subject: ValueRef };

/** Immutable statement list (builders use mutable `Stmt[]` then return as Block). */
export type Block = readonly Stmt[];

export type Stmt =
  | { readonly kind: 'if'; readonly cond: Expr; readonly body: Block }
  | { readonly kind: 'foreach'; readonly iterable: ValueRef; readonly keyVar: string | null; readonly valueVar: string; readonly body: Block }
  | { readonly kind: 'return'; readonly expr: Expr };

export type CheckerProgram = {
  readonly parameter: string;
  readonly body: Block;
};

export type CheckerIR = {
  readonly programs: Readonly<Record<string, CheckerProgram>>;
  readonly order: readonly string[];
  /** User-facing entry checkers in parse order; never pruned by the optimizer. */
  readonly entries: readonly string[];
};
