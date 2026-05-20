import { describe, expect, it } from 'vitest';
import { parseType } from '../../../parser/index.ts';
import { IsStyleFunctionNameProposer, SequentialCheckNameProposer } from './proposer.ts';

describe('IsStyleFunctionNameProposer', () => {
  const propose = (type: string) =>
    new IsStyleFunctionNameProposer().name(parseType(type));

  it('maps int to isInt', () => {
    expect(propose('int')).toBe('isInt');
  });

  it('maps array<never> from formatted type string', () => {
    expect(propose('array<never>')).toBe('isArrayNever');
  });

  it('maps union from formatted type string', () => {
    expect(propose('array<int>|array<string>')).toBe('isArrayIntArrayString');
  });

  it('maps iterable<string>', () => {
    expect(propose('iterable<string>')).toBe('isIterableString');
    expect(propose('array<string>')).toBe('isArrayString');
  });

  it('maps non-empty collection keywords', () => {
    expect(propose('non-empty-array<string>')).toBe('isNonEmptyArrayString');
    expect(propose('non-empty-list<int>')).toBe('isNonEmptyListInt');
  });

  it('maps keyed array with mixed', () => {
    expect(propose('array<string, mixed>')).toBe('isArrayStringMixed');
  });

  it('maps keywords with hyphens', () => {
    expect(propose('negative-int')).toBe('isNegativeInt');
  });

  it('maps bare array keyword', () => {
    expect(propose('array')).toBe('isArray');
  });

  it('maps shapes from formatted string', () => {
    expect(propose('object{foo: int}')).toBe('isObjectFooInt');
    expect(propose('array{foo: int}')).toBe('isArrayFooInt');
  });
});

describe('SequentialCheckNameProposer', () => {
  it('assigns check_N in order, ignoring type', () => {
    const proposer = new SequentialCheckNameProposer();
    expect(proposer.name(parseType('int'))).toBe('check');
    expect(proposer.name(parseType('string'))).toBe('check_1');
  });
});
