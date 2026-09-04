import { describe, expect, it } from 'vitest';
import { parseType } from '../../../parser/index.ts';
import { IsStyleFunctionNameProposer, SequentialCheckNameProposer } from './proposer.ts';

function proposeIsStyle(type: string): string {
  return new IsStyleFunctionNameProposer().name(parseType(type));
}

describe('IsStyleFunctionNameProposer', () => {
  it('maps int to isInt', () => {
    expect(proposeIsStyle('int')).toBe('isInt');
  });

  it('maps array<never> from formatted type string', () => {
    expect(proposeIsStyle('array<never>')).toBe('isArrayNever');
  });

  it('maps union from formatted type string', () => {
    expect(proposeIsStyle('array<int>|array<string>')).toBe('isArrayIntArrayString');
  });

  it('maps iterable<string>', () => {
    expect(proposeIsStyle('iterable<string>')).toBe('isIterableString');
    expect(proposeIsStyle('array<string>')).toBe('isArrayString');
  });

  it('maps non-empty collection keywords', () => {
    expect(proposeIsStyle('non-empty-array<string>')).toBe('isNonEmptyArrayString');
    expect(proposeIsStyle('non-empty-list<int>')).toBe('isNonEmptyListInt');
  });

  it('maps keyed array with mixed', () => {
    expect(proposeIsStyle('array<string, mixed>')).toBe('isArrayStringMixed');
  });

  it('maps keywords with hyphens', () => {
    expect(proposeIsStyle('negative-int')).toBe('isNegativeInt');
  });

  it('maps bare array keyword', () => {
    expect(proposeIsStyle('array')).toBe('isArray');
  });

  it('maps shapes from formatted string', () => {
    expect(proposeIsStyle('object{foo: int}')).toBe('isObjectFooInt');
    expect(proposeIsStyle('array{foo: int}')).toBe('isArrayFooInt');
  });
});

describe('SequentialCheckNameProposer', () => {
  it('assigns check_N in order, ignoring type', () => {
    const proposer = new SequentialCheckNameProposer();
    expect(proposer.name(parseType('int'))).toBe('check');
    expect(proposer.name(parseType('string'))).toBe('check_1');
  });
});
