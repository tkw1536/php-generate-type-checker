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
} from '../../ir/index.ts';
import { DECIMAL_INT_STRING_PATTERN } from '../../decimalIntString.ts';
import {
  absorbImpliedOperands,
  entails,
  entailsUsesExclusive,
  implies,
} from './implies.ts';
import { canonicalizeFactExpr } from '../passes/facts/canon.ts';

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

describe('implies tags', () => {
  it('is_a / instanceof / exclusivity', () => {
    expect(implies(isA, classExists)).toBe(true);
    expect(implies(isInstance, isObject)).toBe(true);
    expect(
      implies(isInstance, notExpr(callExpr('is_array', [refArg($v)]))),
    ).toBe(true);
    expect(implies(classExists, isA)).toBe(false);
    expect(implies(isObject, isInstance)).toBe(false);
    expect(implies(isInt, notExpr(isString))).toBe(true);
    expect(implies(isString, notExpr(isInt))).toBe(true);
    expect(
      implies(isInt, notExpr(callExpr('is_resource', [refArg($v)]))),
    ).toBe(true);
  });

  it('typed literals imply is_* tags', () => {
    const isArray = callExpr('is_array', [refArg($v)]);
    expect(
      implies(binExpr('===', refArg($v), literalArg('null')), notExpr(isArray)),
    ).toBe(true);
    expect(implies(binExpr('===', refArg($v), literalArg('0')), isInt)).toBe(
      true,
    );
    expect(implies(isInt, binExpr('===', refArg($v), literalArg('0')))).toBe(
      false,
    );
    expect(
      implies(binExpr('===', refArg($v), literalArg("''")), isString),
    ).toBe(true);
    expect(implies(binExpr('===', refArg($v), literalArg('[]')), isArray)).toBe(
      true,
    );
  });
});

describe('implies empty array count', () => {
  it('=== [] implies count === 0', () => {
    const eqArr = binExpr('===', refArg($v), literalArg('[]'));
    const countZero = binExpr(
      '===',
      callArg('count', [refArg($v)]),
      literalArg('0'),
    );
    expect(implies(eqArr, countZero)).toBe(true);
  });
});

describe('implies array_key_exists / positive count', () => {
  const keyExists = callExpr('array_key_exists', [
    literalArg("'foo'"),
    refArg($v),
  ]);
  const nonEmpty = binExpr('!==', refArg($v), literalArg('[]'));
  const countNonZero = binExpr(
    '!==',
    callArg('count', [refArg($v)]),
    literalArg('0'),
  );
  const countTwo = binExpr(
    '===',
    callArg('count', [refArg($v)]),
    literalArg('2'),
  );

  it('array_key_exists implies !== []', () => {
    expect(implies(keyExists, nonEmpty)).toBe(true);
    expect(implies(nonEmpty, keyExists)).toBe(false);
  });

  it('array_key_exists implies count !== 0', () => {
    expect(implies(keyExists, countNonZero)).toBe(true);
    expect(implies(countNonZero, keyExists)).toBe(false);
  });

  it('count === N (N≥1) implies !== []', () => {
    expect(implies(countTwo, nonEmpty)).toBe(true);
    expect(implies(nonEmpty, countTwo)).toBe(false);
  });

  it('count === 0 does not imply !== []', () => {
    const countZero = binExpr(
      '===',
      callArg('count', [refArg($v)]),
      literalArg('0'),
    );
    expect(implies(countZero, nonEmpty)).toBe(false);
  });

  it('AND absorb drops !== [] under array_key_exists', () => {
    expect(absorbImpliedOperands([keyExists, nonEmpty], 'and')).toEqual([
      keyExists,
    ]);
  });
});

describe('implies list higher key_exists', () => {
  const isList = callExpr('array_is_list', [refArg($v)]);
  const key0 = callExpr('array_key_exists', [literalArg('0'), refArg($v)]);
  const key1 = callExpr('array_key_exists', [literalArg('1'), refArg($v)]);
  const key2 = callExpr('array_key_exists', [literalArg('2'), refArg($v)]);

  it('list ∧ key_exists(N) implies key_exists(k) for k < N', () => {
    expect(implies(andExpr([isList, key2]), key0)).toBe(true);
    expect(implies(andExpr([isList, key2]), key1)).toBe(true);
    expect(implies(andExpr([isList, key1]), key0)).toBe(true);
    expect(implies(andExpr([isList, key1]), key2)).toBe(false);
    // andConjunct + refl: key2 among premises implies key2.
    expect(implies(andExpr([isList, key2]), key2)).toBe(true);
  });

  it('key_exists(N) alone does not imply lower key without list', () => {
    expect(implies(key2, key1)).toBe(false);
    expect(implies(andExpr([key2, key1]), key0)).toBe(false);
  });

  it('AND absorb keeps only max key under list', () => {
    expect(absorbImpliedOperands([isList, key0, key1, key2], 'and')).toEqual([
      isList,
      key2,
    ]);
  });

  it('AND absorb leaves keys unchanged without list', () => {
    expect(absorbImpliedOperands([key0, key1, key2], 'and')).toEqual([
      key0,
      key1,
      key2,
    ]);
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

describe('entailsUsesExclusive', () => {
  it('is_int ∨ is_string entails ¬is_array via exclusivity', () => {
    const isArray = callExpr('is_array', [refArg($v)]);
    expect(
      entailsUsesExclusive(orExpr([isInt, isString]), notExpr(isArray)),
    ).toBe(true);
  });

  it('is_int entails is_int without exclusivity', () => {
    expect(entailsUsesExclusive(isInt, isInt)).toBe(false);
  });

  it('is_a entails class_exists without exclusivity', () => {
    expect(entailsUsesExclusive(isA, classExists)).toBe(false);
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
