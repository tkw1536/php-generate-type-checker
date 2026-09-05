import { describe, expect, it } from 'vitest';
import {
  andExpr,
  arrayAccessRef,
  binExpr,
  boolLit,
  callArg,
  callCheckerExpr,
  callExpr,
  instanceofExpr,
  literalArg,
  notExpr,
  orExpr,
  propertyAccessRef,
  refArg,
  variableRef,
} from './index.ts';
import { equals } from './equals.ts';

const $v = variableRef('$value');
const $key = variableRef('$key');
const $elem = variableRef('$elem');
const isIntOnV = callExpr('is_int', [refArg($v)]);
const isStringOnV = callExpr('is_string', [refArg($v)]);

const DISTINCT_EXPRS = [
  boolLit(true),
  boolLit(false),
  notExpr(boolLit(true)),
  notExpr(isIntOnV),
  isIntOnV,
  isStringOnV,
  callExpr('is_int', [refArg(variableRef('$other'))]),
  callExpr('count', [refArg($v)]),
  callExpr('array_key_exists', [literalArg('foo'), refArg($v)]),
  callExpr('in_array', [
    literalArg('bar'),
    refArg($v),
    callArg('is_string', [refArg($key)]),
  ]),
  andExpr([isIntOnV, isStringOnV]),
  andExpr([isStringOnV, isIntOnV]),
  orExpr([isIntOnV, isStringOnV]),
  orExpr([notExpr(isIntOnV), notExpr(isStringOnV)]),
  binExpr('===', refArg($v), literalArg('1')),
  binExpr('===', refArg($v), literalArg('2')),
  binExpr('!==', refArg($v), literalArg('[]')),
  binExpr('>', refArg($v), literalArg('0')),
  binExpr('>=', refArg($elem), literalArg('0')),
  instanceofExpr(refArg($v), 'Foo\\Bar'),
  instanceofExpr(refArg($v), 'Baz'),
  instanceofExpr(refArg($elem), 'Foo\\Bar'),
  callCheckerExpr('check_shape', $v),
  callCheckerExpr('check_list', $v),
  callCheckerExpr('check_shape', $elem),
  callExpr('is_array', [refArg(arrayAccessRef($v, 'id'))]),
  callExpr('is_array', [refArg(arrayAccessRef($v, 0))]),
  callExpr('property_exists', [refArg($v), literalArg('name')]),
  callExpr('is_string', [refArg(propertyAccessRef($v, 'name'))]),
  notExpr(andExpr([isIntOnV, isStringOnV])),
  callExpr('preg_match', [literalArg('/^\\d+$/'), refArg($v)]),
];

function treatsEveryPairAsUnequal(): void {
  for (const [i, left] of DISTINCT_EXPRS.entries()) {
    expect(equals(left, left)).toBe(true);
    for (const right of DISTINCT_EXPRS.slice(i + 1)) {
      expect(equals(left, right)).toBe(false);
      expect(equals(right, left)).toBe(false);
    }
  }
}

describe('equals', () => {
  it('treats every pair in a large fixture set as unequal', treatsEveryPairAsUnequal);

  it('treats instanceof class names as case-insensitive', () => {
    expect(
      equals(
        instanceofExpr(refArg($v), 'Foo'),
        instanceofExpr(refArg($v), 'foo'),
      ),
    ).toBe(true);
    expect(
      equals(
        instanceofExpr(refArg($v), 'Foo\\Bar'),
        instanceofExpr(refArg($v), 'foo\\bar'),
      ),
    ).toBe(true);
  });
});
