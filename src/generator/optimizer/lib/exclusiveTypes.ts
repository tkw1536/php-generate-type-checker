import type { Arg, Expr } from '../../ir/types.ts';
import {
  binExpr,
  callExpr,
  literalArg,
  notExpr,
} from '../../ir/index.ts';

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

export type ExclusiveTag =
  | { readonly kind: 'call'; readonly name: ExclusiveCallName; readonly subject: Arg }
  | { readonly kind: 'null'; readonly subject: Arg };

function isNullLiteral(arg: Arg): boolean {
  return (
    arg.kind === 'literal' &&
    (arg.value === 'null' || arg.value === 'NULL')
  );
}

function isExclusiveCallName(name: string): name is ExclusiveCallName {
  return (EXCLUSIVE_IS_CALLS as readonly string[]).includes(name);
}

function sameSubject(a: Arg, b: Arg): boolean {
  if (a.kind !== 'ref' || b.kind !== 'ref') {
    return false;
  }
  const ra = a.ref;
  const rb = b.ref;
  if (ra.kind === 'parameter' && rb.kind === 'parameter') {
    return true;
  }
  if (ra.kind === 'variable' && rb.kind === 'variable') {
    return ra.id === rb.id;
  }
  return false;
}

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

function exclusiveCallNameForLiteral(value: string): ExclusiveCallName | null {
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

function tagsEqual(a: ExclusiveTag, b: ExclusiveTag): boolean {
  if (a.kind !== b.kind || !sameSubject(a.subject, b.subject)) {
    return false;
  }
  if (a.kind === 'call' && b.kind === 'call') {
    return a.name === b.name;
  }
  return a.kind === 'null' && b.kind === 'null';
}

/** Exclusive type tag of `expr`, or null if not a primary type check. */
export function exclusiveTag(expr: Expr): ExclusiveTag | null {
  if (
    expr.kind === 'call' &&
    expr.args.length === 1 &&
    isExclusiveCallName(expr.name)
  ) {
    return { kind: 'call', name: expr.name, subject: expr.args[0] };
  }
  if (expr.kind === 'bin' && expr.op === '===') {
    if (isNullLiteral(expr.right)) {
      return { kind: 'null', subject: expr.left };
    }
    if (isNullLiteral(expr.left)) {
      return { kind: 'null', subject: expr.right };
    }
  }
  return null;
}

/** All `not(otherTag)` facts implied by knowing `tag`. */
export function otherExclusiveNegations(tag: ExclusiveTag): readonly Expr[] {
  const out: Expr[] = [];
  for (const name of EXCLUSIVE_IS_CALLS) {
    if (tag.kind === 'call' && tag.name === name) {
      continue;
    }
    out.push(notExpr(callExpr(name, [tag.subject])));
  }
  if (tag.kind !== 'null') {
    out.push(notExpr(binExpr('===', tag.subject, literalArg('null'))));
  }
  return out;
}

/** True when knowing exclusive tag `a` implies `not(other exclusive tag)` as `b`. */
export function exclusiveTypeImplies(a: Expr, b: Expr): boolean {
  const tagA = exclusiveTag(a);
  if (tagA === null || b.kind !== 'not') {
    return false;
  }
  const tagB = exclusiveTag(b.expr);
  if (tagB === null || tagsEqual(tagA, tagB)) {
    return false;
  }
  return sameSubject(tagA.subject, tagB.subject);
}
