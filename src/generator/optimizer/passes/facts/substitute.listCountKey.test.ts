import { describe, expect, it } from 'vitest';
import {
  andExpr,
  binExpr,
  boolLit,
  callArg,
  callExpr,
  literalArg,
  parameterRef,
  refArg,
} from '../../../ir/index.ts';
import { emptyFactEnv } from './env.types.ts';
import { substituteFacts } from './substitute.ts';

const $v = parameterRef();
const isList = callExpr('array_is_list', [refArg($v)]);
const countTwo = binExpr(
  '===',
  callArg('count', [refArg($v)]),
  literalArg('2'),
);
const key0 = callExpr('array_key_exists', [literalArg('0'), refArg($v)]);
const key1 = callExpr('array_key_exists', [literalArg('1'), refArg($v)]);
const key2 = callExpr('array_key_exists', [literalArg('2'), refArg($v)]);
const keyFoo = callExpr('array_key_exists', [
  literalArg("'foo'"),
  refArg($v),
]);

describe('normalizeListCountKeyExists', () => {
  it('rewrites in-range key_exists to TRUE under list + count', () => {
    // Keys normalize to TRUE under list+count; AND cover then drops the
    // redundant TRUE conjuncts (TRUE ∧ … ≡ …).
    expect(
      substituteFacts(
        andExpr([isList, countTwo, key0, key1]),
        emptyFactEnv(),
      ).expr,
    ).toEqual(andExpr([isList, countTwo]));
  });

  it('leaves out-of-range key_exists unchanged', () => {
    expect(
      substituteFacts(andExpr([isList, countTwo, key2]), emptyFactEnv()).expr,
    ).toEqual(andExpr([isList, countTwo, key2]));
  });

  it('leaves key_exists unchanged without array_is_list', () => {
    expect(
      substituteFacts(andExpr([countTwo, key0]), emptyFactEnv()).expr,
    ).toEqual(andExpr([countTwo, key0]));
  });

  it('leaves string-key key_exists unchanged', () => {
    expect(
      substituteFacts(andExpr([isList, countTwo, keyFoo]), emptyFactEnv())
        .expr,
    ).toEqual(andExpr([isList, countTwo, keyFoo]));
  });
});

const nonEmpty = binExpr('!==', refArg($v), literalArg('[]'));

describe('normalizeListNonEmptyKey0', () => {
  it('rewrites key_exists(0) to TRUE under list + non-empty', () => {
    expect(
      substituteFacts(andExpr([isList, nonEmpty, key0]), emptyFactEnv()).expr,
    ).toEqual(andExpr([isList, nonEmpty, boolLit(true)]));
  });

  it('leaves key_exists(1) unchanged under list + non-empty', () => {
    // key_exists(1) ⇒ !== []; absorb drops the redundant non-empty conjunct.
    expect(
      substituteFacts(andExpr([isList, nonEmpty, key1]), emptyFactEnv()).expr,
    ).toEqual(andExpr([isList, key1]));
  });

  it('leaves key_exists(0) unchanged without non-empty', () => {
    expect(
      substituteFacts(andExpr([isList, key0]), emptyFactEnv()).expr,
    ).toEqual(andExpr([isList, key0]));
  });
});

describe('list higher key_exists absorb', () => {
  it('drops lower key_exists under list + higher key', () => {
    expect(
      substituteFacts(andExpr([isList, key0, key1, key2]), emptyFactEnv())
        .expr,
    ).toEqual(andExpr([isList, key2]));
  });

  it('leaves keys unchanged without array_is_list', () => {
    expect(
      substituteFacts(andExpr([key0, key1, key2]), emptyFactEnv()).expr,
    ).toEqual(andExpr([key0, key1, key2]));
  });
});
