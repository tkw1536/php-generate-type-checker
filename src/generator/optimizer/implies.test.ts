import { describe, expect, it } from 'vitest';
import {
  andExpr,
  binExpr,
  callArg,
  callExpr,
  instanceofExpr,
  literalArg,
  notExpr,
  orExpr,
  refArg,
  parameterRef,
} from '../ir/index.ts';
import { DECIMAL_INT_STRING_PATTERN } from '../decimalIntString.ts';
import { absorbImpliedOperands, entails, implies } from './implies.ts';
import { canonicalizeFactExpr } from './factCanon.ts';

const $v = parameterRef();
const isA = callExpr('is_a', [
  refArg($v),
  literalArg('Foo::class'),
  literalArg('true'),
]);
const classExists = callExpr('class_exists', [refArg($v)]);
const isInstance = instanceofExpr(refArg($v), 'Foo');
const isObject = callExpr('is_object', [refArg($v)]);
const isInt = callExpr('is_int', [refArg($v)]);
const isString = callExpr('is_string', [refArg($v)]);

describe('implies', () => {
  it('is_a implies class_exists for same subject', () => {
    expect(implies(isA, classExists)).toBe(true);
  });

  it('instanceof implies is_object for same subject', () => {
    expect(implies(isInstance, isObject)).toBe(true);
  });

  it('does not imply reverse', () => {
    expect(implies(classExists, isA)).toBe(false);
    expect(implies(isObject, isInstance)).toBe(false);
  });

  it('is_int implies not is_string', () => {
    expect(implies(isInt, notExpr(isString))).toBe(true);
    expect(implies(isString, notExpr(isInt))).toBe(true);
  });

  it('is_int implies not is_resource', () => {
    const isResource = callExpr('is_resource', [refArg($v)]);
    expect(implies(isInt, notExpr(isResource))).toBe(true);
  });

  it('=== null implies not is_array', () => {
    const isNull = binExpr('===', refArg($v), literalArg('null'));
    const isArray = callExpr('is_array', [refArg($v)]);
    expect(implies(isNull, notExpr(isArray))).toBe(true);
  });

  it('=== 0 implies is_int', () => {
    const eq0 = binExpr('===', refArg($v), literalArg('0'));
    expect(implies(eq0, isInt)).toBe(true);
    expect(implies(isInt, eq0)).toBe(false);
  });

  it('=== "" implies is_string', () => {
    const eqEmpty = binExpr('===', refArg($v), literalArg("''"));
    expect(implies(eqEmpty, isString)).toBe(true);
  });

  it('=== [] implies is_array', () => {
    const eqArr = binExpr('===', refArg($v), literalArg('[]'));
    const isArray = callExpr('is_array', [refArg($v)]);
    expect(implies(eqArr, isArray)).toBe(true);
  });
});

describe('entails', () => {
  it('is_int ∨ is_string entails not is_resource', () => {
    const isResource = callExpr('is_resource', [refArg($v)]);
    expect(
      entails(orExpr([isInt, isString]), notExpr(isResource)),
    ).toBe(true);
  });

  it('true int|non-decimal entails not decimal-int-string', () => {
    const nonDecimal = andExpr([
      isString,
      binExpr(
        '!==',
        callArg('preg_match', [literalArg(DECIMAL_INT_STRING_PATTERN), refArg($v)]),
        literalArg('1'),
      ),
    ]);
    const keyOk = orExpr([isInt, nonDecimal]);
    const notDecimal = orExpr([
      notExpr(isString),
      binExpr(
        '!==',
        callArg('preg_match', [literalArg(DECIMAL_INT_STRING_PATTERN), refArg($v)]),
        literalArg('1'),
      ),
    ]);
    expect(
      entails(
        canonicalizeFactExpr(keyOk),
        canonicalizeFactExpr(notDecimal),
      ),
    ).toBe(true);
  });
});

describe('absorbImpliedOperands', () => {
  it('or keeps weaker class_exists', () => {
    expect(absorbImpliedOperands([isA, classExists], 'or')).toEqual([
      classExists,
    ]);
  });

  it('and keeps stronger is_a', () => {
    expect(absorbImpliedOperands([isA, classExists], 'and')).toEqual([isA]);
  });

  it('or keeps weaker is_int over === 0', () => {
    const eq0 = binExpr('===', refArg($v), literalArg('0'));
    expect(absorbImpliedOperands([isInt, eq0], 'or')).toEqual([isInt]);
  });

  it('and keeps stronger === 0 over is_int', () => {
    const eq0 = binExpr('===', refArg($v), literalArg('0'));
    expect(absorbImpliedOperands([isInt, eq0], 'and')).toEqual([eq0]);
  });
});
