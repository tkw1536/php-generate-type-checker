/** Readable constructors for axiom / rewrite tables. */
import type { BinOp } from '../../ir/types.ts';
import type { ArgPattern, ExprPattern } from './pattern.types.ts';

export const P = {
  exprVar: (name: string): ExprPattern => ({ kind: 'var', name }),
  argVar: (name: string): ArgPattern => ({ kind: 'var', name }),
  anyExpr: (): ExprPattern => ({ kind: 'any' }),
  anyArg: (): ArgPattern => ({ kind: 'any' }),
  bool: (value: boolean): ExprPattern => ({ kind: 'bool', value }),
  not: (expr: ExprPattern): ExprPattern => ({ kind: 'not', expr }),
  and: (exprs: readonly ExprPattern[]): ExprPattern => ({ kind: 'and', exprs }),
  or: (exprs: readonly ExprPattern[]): ExprPattern => ({ kind: 'or', exprs }),
  call: (name: string, args: readonly ArgPattern[]): ExprPattern => ({
    kind: 'call',
    name,
    args,
  }),
  callArg: (name: string, args: readonly ArgPattern[]): ArgPattern => ({
    kind: 'call',
    name,
    args,
  }),
  bin: (
    op: BinOp,
    left: ArgPattern,
    right: ArgPattern,
    commute = false,
  ): ExprPattern => ({ kind: 'bin', op, left, right, commute }),
  instanceOf: (
    subject: ArgPattern,
    className: string | null = null,
  ): ExprPattern => ({
    kind: 'instanceof',
    subject,
    className,
  }),
  lit: (value: string): ArgPattern => ({ kind: 'lit', value }),
  litVar: (name: string): ArgPattern => ({ kind: 'litVar', name }),
  intLitVar: (name: string): ArgPattern => ({ kind: 'intLitVar', name }),
};
