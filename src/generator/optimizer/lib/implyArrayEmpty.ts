import type { Arg, Expr } from '../../ir/types.ts';
import { binExpr, callArg, literalArg } from '../../ir/index.ts';
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
function nonNegIntLiteral(arg: Arg): number | null {
  if (arg.kind !== 'literal') {
    return null;
  }
  if (!/^[0-9]+$/u.test(arg.value)) {
    return null;
  }
  return Number(arg.value);
}

/** Subject of `count($x) === N` (N≥1) from one operand order, or null. */
function countEqualsPositiveSubjectSide(
  countSide: Arg,
  litSide: Arg,
): Arg | null {
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
  return countSide.args[0];
}

/**
 * Subject of `count($x) === N` when N≥1, or null.
 * Accepts either operand order.
 */
function countEqualsPositiveSubject(expr: Expr): Arg | null {
  if (expr.kind !== 'bin' || expr.op !== '===') {
    return null;
  }
  return (
    countEqualsPositiveSubjectSide(expr.left, expr.right) ??
    countEqualsPositiveSubjectSide(expr.right, expr.left)
  );
}

/** `count($x) === N` (N≥1) ⇒ `$x !== []`. */
function countPositiveImpliesNonEmpty(a: Expr, b: Expr): boolean {
  const subject = countEqualsPositiveSubject(a);
  return subject !== null && isNonEmptyArrayCmp(b, subject);
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
  return null;
}
