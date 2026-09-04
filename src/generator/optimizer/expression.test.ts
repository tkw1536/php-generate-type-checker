import { describe, expect, it } from 'vitest';
import {
  andExpr,
  binExpr,
  boolLit,
  callExpr,
  literalArg,
  notExpr,
  orExpr,
  refArg,
  variableRef,
} from '../ir/index.ts';
import type { Expr } from '../ir/types.ts';
import {
  absorbBinOp,
  absorbBinOps,
  expandBinOp,
  expandBinOps,
  simplifyExpression,
} from './expression.ts';
import { createOptimizerParams } from './params.ts';

const defaultParams = createOptimizerParams({ programs: {}, order: [], entries: [] });

const $v = variableRef('$value');
const isInt = callExpr('is_int', [refArg($v)]);
const isString = callExpr('is_string', [refArg($v)]);
const empty = literalArg('[]');

describe('simplifyExpression', () => {
  it.each([
    ['double not', notExpr(notExpr(isInt)), isInt],
    [
      'flatten nested and',
      andExpr([andExpr([isInt, boolLit(true)]), isString]),
      andExpr([isInt, isString]),
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
      notExpr(andExpr([isInt, isString])),
      orExpr([notExpr(isInt), notExpr(isString)]),
    ],
    [
      'de morgan not or',
      notExpr(orExpr([isInt, isString])),
      andExpr([notExpr(isInt), notExpr(isString)]),
    ],
    ['contradiction a and not a', andExpr([isInt, notExpr(isInt)]), boolLit(false)],
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
        andExpr([isInt, isString]),
        andExpr([isInt, callExpr('is_bool', [refArg($v)])]),
      ]),
      andExpr([isInt, orExpr([isString, callExpr('is_bool', [refArg($v)])])]),
    ],
    [
      'factor common disjunct out of and-of-ors',
      andExpr([
        orExpr([isInt, isString]),
        orExpr([isInt, callExpr('is_bool', [refArg($v)])]),
      ]),
      orExpr([isInt, andExpr([isString, callExpr('is_bool', [refArg($v)])])]),
    ],
    [
      'factor three-arm or with shared guards',
      orExpr([
        andExpr([
          callExpr('is_array', [refArg($v)]),
          callExpr('array_key_exists', [literalArg('x'), refArg($v)]),
          isString,
        ]),
        andExpr([
          callExpr('is_array', [refArg($v)]),
          callExpr('array_key_exists', [literalArg('y'), refArg($v)]),
          isInt,
        ]),
        andExpr([
          callExpr('is_array', [refArg($v)]),
          callExpr('array_key_exists', [literalArg('z'), refArg($v)]),
          callExpr('is_bool', [refArg($v)]),
        ]),
      ]),
      andExpr([
        callExpr('is_array', [refArg($v)]),
        orExpr([
          andExpr([
            callExpr('array_key_exists', [literalArg('x'), refArg($v)]),
            isString,
          ]),
          andExpr([
            callExpr('array_key_exists', [literalArg('y'), refArg($v)]),
            isInt,
          ]),
          andExpr([
            callExpr('array_key_exists', [literalArg('z'), refArg($v)]),
            callExpr('is_bool', [refArg($v)]),
          ]),
        ]),
      ]),
    ],
    [
      'factor (a and b) or a to a',
      orExpr([andExpr([isInt, isString]), isInt]),
      isInt,
    ],
    [
      'factor equivalent and arms with different conjunct order',
      orExpr([andExpr([isInt, isString]), andExpr([isString, isInt])]),
      andExpr([isInt, isString]),
    ],
  ] as [string, Expr, Expr][])('%s', (_name, input, expected) => {
    expect(simplifyExpression(input, defaultParams)).toEqual(expected);
  });
});

describe('expandBinOp / absorbBinOp', () => {
  const ne = binExpr('!==', refArg($v), empty);

  it('expandBinOp wraps !==', () => {
    expect(ne.kind).toBe('bin');
    if (ne.kind !== 'bin') {
      throw new Error('expected bin expression');
    }
    expect(expandBinOp(ne)).toEqual(notExpr(binExpr('===', refArg($v), empty)));
  });

  it('absorbBinOp unwraps not(===)', () => {
    expect(absorbBinOp(notExpr(binExpr('===', refArg($v), empty)))).toEqual(ne);
  });

  it('expandBinOps leaves positive bin', () => {
    const pos = binExpr('===', refArg($v), empty);
    expect(expandBinOps(pos)).toEqual(pos);
  });

  it('absorbBinOps through and', () => {
    const input = andExpr([notExpr(binExpr('===', refArg($v), empty)), isInt]);
    expect(absorbBinOps(input)).toEqual(andExpr([ne, isInt]));
  });
});
