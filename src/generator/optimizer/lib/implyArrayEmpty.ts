import type { Arg, Expr } from '../../ir/types.ts';
import { binExpr, callArg, callExpr, literalArg, notExpr } from '../../ir/index.ts';
import { equals } from '../../ir/equals.ts';
import type { ImplyProof } from '../proof/types.ts';

function isEmptyArrayLiteral(arg: Arg): boolean {
  return arg.kind === 'literal' && arg.value === '[]';
}

/** `$x === []` ⇒ `count($x) === 0`. */
function emptyArrayImpliesCountZero(a: Expr, b: Expr): boolean {
  if (a.kind !== 'bin' || a.op !== '===') {
    return false;
  }
  let subject: Arg | null = null;
  if (isEmptyArrayLiteral(a.right)) {
    subject = a.left;
  } else if (isEmptyArrayLiteral(a.left)) {
    subject = a.right;
  }
  if (subject === null) {
    return false;
  }
  return (
    equals(b, binExpr('===', callArg('count', [subject]), literalArg('0'))) ||
    equals(b, binExpr('===', literalArg('0'), callArg('count', [subject])))
  );
}

/** Subject array of `array_key_exists($k, $x)`, or null. */
function arrayKeyExistsSubject(expr: Expr): Arg | null {
  if (
    expr.kind !== 'call' ||
    expr.name !== 'array_key_exists' ||
    expr.args.length !== 2
  ) {
    return null;
  }
  return expr.args[1];
}

/** Whether `b` is `$x !== []` / `[] !== $x` for subject `$x`. */
function isNonEmptyArrayCmp(b: Expr, subject: Arg): boolean {
  return (
    equals(b, binExpr('!==', subject, literalArg('[]'))) ||
    equals(b, binExpr('!==', literalArg('[]'), subject))
  );
}

/** Whether `b` is `count($x) !== 0` / `0 !== count($x)` for subject `$x`. */
function isCountNonZeroCmp(b: Expr, subject: Arg): boolean {
  const count = callArg('count', [subject]);
  return (
    equals(b, binExpr('!==', count, literalArg('0'))) ||
    equals(b, binExpr('!==', literalArg('0'), count))
  );
}

/** `array_key_exists($k, $x)` ⇒ `$x !== []`. */
function arrayKeyExistsImpliesNonEmpty(a: Expr, b: Expr): boolean {
  const subject = arrayKeyExistsSubject(a);
  return subject !== null && isNonEmptyArrayCmp(b, subject);
}

/** `array_key_exists($k, $x)` ⇒ `count($x) !== 0`. */
function arrayKeyExistsImpliesCountNonZero(a: Expr, b: Expr): boolean {
  const subject = arrayKeyExistsSubject(a);
  return subject !== null && isCountNonZeroCmp(b, subject);
}

/**
 * Integer literal value when `arg` is a plain decimal int string, else null.
 * Rejects signs/whitespace so only generator-style `0`, `1`, `2`, … match.
 */
export function nonNegIntLiteral(arg: Arg): number | null {
  if (arg.kind !== 'literal') {
    return null;
  }
  if (!/^[0-9]+$/u.test(arg.value)) {
    return null;
  }
  return Number(arg.value);
}

/** Subject + N of `count($x) === N` (N≥1) from one operand order, or null. */
function countEqualsPositiveSide(
  countSide: Arg,
  litSide: Arg,
): { readonly subject: Arg; readonly n: number } | null {
  if (
    countSide.kind !== 'call' ||
    countSide.name !== 'count' ||
    countSide.args.length !== 1
  ) {
    return null;
  }
  const n = nonNegIntLiteral(litSide);
  if (n === null || n < 1) {
    return null;
  }
  const subject = countSide.args[0];
  if (subject === undefined) {
    return null;
  }
  return { subject, n };
}

/**
 * Match `count($x) === N` when N≥1 (either operand order).
 * Used by imply leaves and list-count key_exists normalize.
 */
export function matchCountEqualsPositive(
  expr: Expr,
): { readonly subject: Arg; readonly n: number } | null {
  if (expr.kind !== 'bin' || expr.op !== '===') {
    return null;
  }
  return (
    countEqualsPositiveSide(expr.left, expr.right) ??
    countEqualsPositiveSide(expr.right, expr.left)
  );
}

/** `count($x) === N` (N≥1) ⇒ `$x !== []`. */
function countPositiveImpliesNonEmpty(a: Expr, b: Expr): boolean {
  const matched = matchCountEqualsPositive(a);
  return matched !== null && isNonEmptyArrayCmp(b, matched.subject);
}

function isEmptyArrayCmp(expr: Expr, subject: Arg): boolean {
  return (
    equals(expr, binExpr('===', subject, literalArg('[]'))) ||
    equals(expr, binExpr('===', literalArg('[]'), subject))
  );
}

/**
 * `!array_key_exists(0, $x)` ⇒ OR that includes `!array_is_list($x)` and
 * `$x === []` (contrapositive of non-empty list ⇒ key 0).
 */
function notKey0ImpliesNotListOrEmpty(a: Expr, b: Expr): boolean {
  if (a.kind !== 'not') {
    return false;
  }
  const keyCall = a.expr;
  if (
    keyCall.kind !== 'call' ||
    keyCall.name !== 'array_key_exists' ||
    keyCall.args.length !== 2
  ) {
    return false;
  }
  if (nonNegIntLiteral(keyCall.args[0]) !== 0) {
    return false;
  }
  const subject = keyCall.args[1];
  if (subject === undefined) {
    return false;
  }
  const disjuncts = b.kind === 'or' ? b.exprs : [b];
  const notList = notExpr(callExpr('array_is_list', [subject]));
  const hasNotList = disjuncts.some((d) => equals(d, notList));
  const hasEmpty = disjuncts.some((d) => isEmptyArrayCmp(d, subject));
  return hasNotList && hasEmpty;
}

/** Empty-array / key-exists / positive-count implication leaves. */
export function arrayEmptyImplyProof(
  a: Expr,
  b: Expr,
): ImplyProof | null {
  if (emptyArrayImpliesCountZero(a, b)) {
    return { kind: 'emptyArrayCount' };
  }
  if (arrayKeyExistsImpliesNonEmpty(a, b)) {
    return { kind: 'arrayKeyExistsNonEmpty' };
  }
  if (arrayKeyExistsImpliesCountNonZero(a, b)) {
    return { kind: 'arrayKeyExistsCountNonZero' };
  }
  if (countPositiveImpliesNonEmpty(a, b)) {
    return { kind: 'countPositiveNonEmpty' };
  }
  if (notKey0ImpliesNotListOrEmpty(a, b)) {
    return { kind: 'notKey0NotListOrEmpty' };
  }
  return null;
}
