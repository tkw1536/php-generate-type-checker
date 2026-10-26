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
    expect(
      substituteFacts(
        andExpr([isList, countTwo, key0, key1]),
        emptyFactEnv(),
      ).expr,
    ).toEqual(andExpr([isList, countTwo, boolLit(true), boolLit(true)]));
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
