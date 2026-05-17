/**
 * Checker IR: PHP-shaped AST for generated checker function bodies.
 */
export type ValueRef =
  | { kind: 'variable'; name: string }
  | { kind: 'array_access'; object: ValueRef; key: string | number }
  | { kind: 'property_access'; object: ValueRef; name: string };

export type BinOp = '===' | '!==' | '==' | '!=' | '>' | '<' | '>=' | '<=';

export type Arg =
  | { kind: 'ref'; ref: ValueRef }
  | { kind: 'literal'; value: string }
  | { kind: 'call'; name: string; args: Arg[] };

export type Expr =
  | { kind: 'bool'; value: boolean }
  | { kind: 'not'; expr: Expr }
  | { kind: 'and'; exprs: Expr[] }
  | { kind: 'or'; exprs: Expr[] }
  | { kind: 'call'; name: string; args: Arg[] }
  | { kind: 'bin'; op: BinOp; left: Arg; right: Arg }
  | { kind: 'instanceof'; subject: Arg; className: string }
  | { kind: 'call_checker'; name: string; subject: ValueRef };

export type Block = Stmt[];

export type Stmt =
  | { kind: 'if'; cond: Expr; body: Block }
  | { kind: 'foreach'; iterable: ValueRef; keyVar: string | null; valueVar: string; body: Block }
  | { kind: 'return'; expr: Expr };

export type CheckerProgram = {
  parameter: string;
  body: Block;
};

export type CheckerIR = {
  programs: Record<string, CheckerProgram>;
  order: string[];
  /** User-facing entry checkers in parse order; never pruned by the optimizer. */
  entries: string[];
};
