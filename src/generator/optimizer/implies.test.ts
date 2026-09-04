import { describe, expect, it } from 'vitest';
import {
  callExpr,
  instanceofExpr,
  literalArg,
  refArg,
  variableRef,
} from '../ir/index.ts';
import { absorbImpliedOperands, implies } from './implies.ts';

const $v = variableRef('$value');
const isA = callExpr('is_a', [
  refArg($v),
  literalArg('Foo::class'),
  literalArg('true'),
]);
const classExists = callExpr('class_exists', [refArg($v)]);
const isInstance = instanceofExpr(refArg($v), 'Foo');
const isObject = callExpr('is_object', [refArg($v)]);

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
});
