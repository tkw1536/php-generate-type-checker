import type { Arg, Expr } from '../../ir/types.ts';
import { callExpr } from '../../ir/index.ts';

/** PHP type tags that partition values (pairwise exclusive on one subject). */
export const EXCLUSIVE_IS_CALLS = [
  'is_bool',
  'is_int',
  'is_float',
  'is_string',
  'is_array',
  'is_object',
  'is_resource',
] as const;

export type ExclusiveCallName = (typeof EXCLUSIVE_IS_CALLS)[number];

function isSubjectArg(arg: Arg): boolean {
  return arg.kind === 'ref';
}

/** `is_*` call implied by `$x === LIT` / `LIT === $x`, or null (null literals use exclusive null tag). */
export function typeCallImpliedByEquality(expr: Expr): Expr | null {
  if (expr.kind !== 'bin' || expr.op !== '===') {
    return null;
  }
  let subject: Arg;
  let lit: Arg;
  if (isSubjectArg(expr.left) && expr.right.kind === 'literal') {
    subject = expr.left;
    lit = expr.right;
  } else if (isSubjectArg(expr.right) && expr.left.kind === 'literal') {
    subject = expr.right;
    lit = expr.left;
  } else {
    return null;
  }
  const name = exclusiveCallNameForLiteral(lit.value);
  if (name === null) {
    return null;
  }
  return callExpr(name, [subject]);
}

/** Classify a PHP literal string into an exclusive is_* tag, or null for null literals / unknowns. */
export function exclusiveCallNameForLiteral(value: string): ExclusiveCallName | null {
  if (value === 'null' || value === 'NULL') {
    return null;
  }
  if (
    value === 'true' ||
    value === 'TRUE' ||
    value === 'false' ||
    value === 'FALSE'
  ) {
    return 'is_bool';
  }
  if (value === '[]') {
    return 'is_array';
  }
  if (
    (value.startsWith("'") && value.endsWith("'")) ||
    (value.startsWith('"') && value.endsWith('"'))
  ) {
    return 'is_string';
  }
  if (/^-?\d+$/u.test(value)) {
    return 'is_int';
  }
  if (/^-?(?:\d+\.\d+|\d+(?:\.\d+)?[eE][+-]?\d+)$/u.test(value)) {
    return 'is_float';
  }
  return null;
}
