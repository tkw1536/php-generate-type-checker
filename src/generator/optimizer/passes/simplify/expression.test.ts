import { describe, expect, it } from 'vitest';
import {
  andExpr,
  binExpr,
  boolLit,
  callExpr,
  instanceofExpr,
  literalArg,
  notExpr,
  orExpr,
  refArg,
  parameterRef,
} from '../../../ir/index.ts';
import type { Expr } from '../../../ir/types.ts';
import { simplifyExpression } from './expression.ts';
import { createOptimizerParams } from '../../params.ts';

const defaultParams = createOptimizerParams({
  programs: {},
  order: [],
  entries: [],
});

const $v = parameterRef();
const isInt = callExpr('is_int', [refArg($v)]);
const isString = callExpr('is_string', [refArg($v)]);
const isArray = callExpr('is_array', [refArg($v)]);
const keyX = callExpr('array_key_exists', [literalArg("'x'"), refArg($v)]);
const keyY = callExpr('array_key_exists', [literalArg("'y'"), refArg($v)]);
const empty = literalArg('[]');

const SIMPLIFY_CASES = [
  ['double not', notExpr(notExpr(isInt)), isInt],
  [
    'flatten nested and',
    andExpr([andExpr([isArray, boolLit(true)]), keyX]),
    andExpr([isArray, keyX]),
  ],
  [
    'flatten nested or',
    orExpr([orExpr([boolLit(false), isInt]), boolLit(false)]),
    isInt,
  ],
  ['true and x', andExpr([boolLit(true), isInt]), isInt],
  ['false and x', andExpr([boolLit(false), isInt]), boolLit(false)],
  ['x or false', orExpr([isInt, boolLit(false)]), isInt],
  ['x or true', orExpr([isInt, boolLit(true)]), boolLit(true)],
  [
    'if-return-return literal fold',
    orExpr([
      andExpr([isInt, boolLit(true)]),
      andExpr([notExpr(isInt), boolLit(false)]),
    ]),
    isInt,
  ],
  [
    'de morgan not and',
    notExpr(andExpr([isArray, keyX])),
    orExpr([notExpr(isArray), notExpr(keyX)]),
  ],
  [
    'de morgan not or',
    notExpr(orExpr([isInt, isString])),
    andExpr([notExpr(isInt), notExpr(isString)]),
  ],
  [
    'de morgan not and of exclusive tags folds to true',
    notExpr(andExpr([isInt, isString])),
    boolLit(true),
  ],
  ['contradiction a and not a', andExpr([isInt, notExpr(isInt)]), boolLit(false)],
  [
    'OR absorb !key_exists(0) under !list and empty',
    orExpr([
      notExpr(callExpr('array_is_list', [refArg($v)])),
      binExpr('===', refArg($v), literalArg('[]')),
      notExpr(callExpr('array_key_exists', [literalArg('0'), refArg($v)])),
    ]),
    orExpr([
      notExpr(callExpr('array_is_list', [refArg($v)])),
      binExpr('===', refArg($v), literalArg('[]')),
    ]),
  ],
  [
    'AND absorb lower key_exists under list and higher key',
    andExpr([
      callExpr('array_is_list', [refArg($v)]),
      callExpr('array_key_exists', [literalArg('0'), refArg($v)]),
      callExpr('array_key_exists', [literalArg('1'), refArg($v)]),
      callExpr('array_key_exists', [literalArg('2'), refArg($v)]),
    ]),
    andExpr([
      callExpr('array_is_list', [refArg($v)]),
      callExpr('array_key_exists', [literalArg('2'), refArg($v)]),
    ]),
  ],
  [
    'contradiction exclusive is_int and is_string',
    andExpr([isInt, isString]),
    boolLit(false),
  ],
  [
    'contradiction instanceof and is_array',
    andExpr([instanceofExpr(refArg($v), 'Foo'), isArray]),
    boolLit(false),
  ],
  ['tautology a or not a', orExpr([isInt, notExpr(isInt)]), boolLit(true)],
  ['dedupe and', andExpr([isInt, isInt]), isInt],
  ['dedupe or', orExpr([isInt, isInt]), isInt],
  [
    'contradiction !== and === on same args',
    andExpr([
      binExpr('!==', refArg($v), empty),
      binExpr('===', refArg($v), empty),
    ]),
    boolLit(false),
  ],
  [
    'absorb not bin !==',
    notExpr(binExpr('!==', refArg($v), empty)),
    binExpr('===', refArg($v), empty),
  ],
  [
    'absorb not bin >',
    notExpr(binExpr('>', refArg($v), literalArg('0'))),
    binExpr('<=', refArg($v), literalArg('0')),
  ],
  [
    'factor common conjunct out of or-of-ands',
    orExpr([
      andExpr([isArray, keyX]),
      andExpr([isArray, keyY]),
    ]),
    andExpr([isArray, orExpr([keyX, keyY])]),
  ],
  [
    'factor common disjunct out of and-of-ors',
    andExpr([
      orExpr([isArray, keyX]),
      orExpr([isArray, keyY]),
    ]),
    orExpr([isArray, andExpr([keyX, keyY])]),
  ],
  [
    'factor three-arm or with shared guards',
    orExpr([
      andExpr([
        isArray,
        callExpr('array_key_exists', [literalArg("'x'"), refArg($v)]),
      ]),
      andExpr([
        isArray,
        callExpr('array_key_exists', [literalArg("'y'"), refArg($v)]),
      ]),
      andExpr([
        isArray,
        callExpr('array_key_exists', [literalArg("'z'"), refArg($v)]),
      ]),
    ]),
    andExpr([
      isArray,
      orExpr([
        callExpr('array_key_exists', [literalArg("'x'"), refArg($v)]),
        callExpr('array_key_exists', [literalArg("'y'"), refArg($v)]),
        callExpr('array_key_exists', [literalArg("'z'"), refArg($v)]),
      ]),
    ]),
  ],
  [
    'factor (a and b) or a to a',
    orExpr([andExpr([isArray, keyX]), isArray]),
    isArray,
  ],
  [
    'factor equivalent and arms with different conjunct order',
    orExpr([andExpr([isArray, keyX]), andExpr([keyX, isArray])]),
    andExpr([isArray, keyX]),
  ],
  [
    'absorb is_object under instanceof in and',
    andExpr([
      callExpr('is_object', [refArg($v)]),
      instanceofExpr(refArg($v), 'Foo'),
    ]),
    instanceofExpr(refArg($v), 'Foo'),
  ],
  [
    'reorder property_exists after instanceof',
    andExpr([
      callExpr('property_exists', [refArg($v), literalArg("'a'")]),
      instanceofExpr(refArg($v), 'Foo'),
    ]),
    andExpr([
      instanceofExpr(refArg($v), 'Foo'),
      callExpr('property_exists', [refArg($v), literalArg("'a'")]),
    ]),
  ],
  [
    'absorb is_object after flatten with instanceof and property_exists',
    andExpr([
      andExpr([
        callExpr('is_object', [refArg($v)]),
        callExpr('property_exists', [refArg($v), literalArg("'a'")]),
      ]),
      instanceofExpr(refArg($v), 'Foo'),
    ]),
    andExpr([
      instanceofExpr(refArg($v), 'Foo'),
      callExpr('property_exists', [refArg($v), literalArg("'a'")]),
    ]),
  ],
  [
    'absorb is_a under class_exists in or',
    orExpr([
      callExpr('is_a', [
        refArg($v),
        literalArg('MyClass::class'),
        literalArg('true'),
      ]),
      callExpr('class_exists', [refArg($v)]),
    ]),
    callExpr('class_exists', [refArg($v)]),
  ],
  [
    'absorb is_a under class_exists in and',
    andExpr([
      callExpr('is_a', [
        refArg($v),
        literalArg('MyClass::class'),
        literalArg('true'),
      ]),
      callExpr('class_exists', [refArg($v)]),
    ]),
    callExpr('is_a', [
      refArg($v),
      literalArg('MyClass::class'),
      literalArg('true'),
    ]),
  ],
  [
    'factor is_string then absorb is_a under class_exists',
    andExpr([
      isString,
      orExpr([
        callExpr('is_a', [
          refArg($v),
          literalArg('IAmValid::class'),
          literalArg('true'),
        ]),
        callExpr('class_exists', [refArg($v)]),
      ]),
    ]),
    andExpr([isString, callExpr('class_exists', [refArg($v)])]),
  ],
  [
    'absorb === 0 under is_int in or',
    orExpr([isInt, binExpr('===', refArg($v), literalArg('0'))]),
    isInt,
  ],
  [
    'absorb is_int under === 0 in and',
    andExpr([isInt, binExpr('===', refArg($v), literalArg('0'))]),
    binExpr('===', refArg($v), literalArg('0')),
  ],
  [
    'absorb is_array under === [] in and',
    andExpr([
      callExpr('is_array', [refArg($v)]),
      binExpr('===', refArg($v), empty),
    ]),
    binExpr('===', refArg($v), empty),
  ],
  [
    'absorb === [] under is_array in or',
    orExpr([
      callExpr('is_array', [refArg($v)]),
      binExpr('===', refArg($v), empty),
    ]),
    callExpr('is_array', [refArg($v)]),
  ],
] as [string, Expr, Expr][];

describe('simplifyExpression', () => {
  it.each(SIMPLIFY_CASES)('%s', (_name, input, expected) => {
    expect(simplifyExpression(input, defaultParams).expr).toEqual(expected);
  });
});
