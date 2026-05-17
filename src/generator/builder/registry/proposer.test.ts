import { describe, expect, it } from 'vitest';
import { parseType } from '../../../parser/index.ts';
import { IsStyleFunctionNameProposer, SequentialCheckNameProposer } from './proposer.ts';
import { sortFlattenedUnionMembers } from '../union.ts';

describe('IsStyleFunctionNameProposer', () => {
  const propose = (type: string) =>
    new IsStyleFunctionNameProposer().name(parseType(type));

  it('maps int to isInt', () => {
    expect(propose('int')).toBe('isInt');
  });

  it('maps array<never> to isArrayNever', () => {
    expect(propose('array<never>')).toBe('isArrayNever');
  });

  it('orders union members like sortFlattenedUnionMembers', () => {
    const u = parseType('array<int>|array<string>');
    const members = sortFlattenedUnionMembers(u);
    const proposer = new IsStyleFunctionNameProposer();
    const parts = members.map((m) => proposer.name(m));
    expect(parts).toEqual(['isArrayInt', 'isArrayString']);
    expect(proposer.name(u)).toBe('isArrayIntOrArrayString');
  });

  it('uses Iterable prefix for lowered iterable<T> (not array<T>)', () => {
    expect(propose('iterable<string>')).toBe('isIterableString');
    expect(propose('array<string>')).toBe('isArrayString');
  });

  it('prefixes NonEmpty for non-empty-array and non-empty-list', () => {
    expect(propose('non-empty-array<string>')).toBe('isNonEmptyArrayString');
    expect(propose('non-empty-list<int>')).toBe('isNonEmptyListInt');
  });

  it('uses Mixed in slugs without a Type suffix', () => {
    expect(propose('array<string, mixed>')).toBe('isArrayStringToMixed');
  });

  it('slugs range and negative-int bounds', () => {
    expect(propose('negative-int')).toBe('isNegativeInt');
    expect(propose('int<-3, -1>')).toBe('isIntGeNeg3LeNeg1');
  });

  it('escapes primitive array to avoid reserved “Array” slug', () => {
    expect(propose('array')).toBe('isArrayType');
  });

  it('prefixes object shapes with ObjectShape (distinct from array shapes)', () => {
    expect(propose('object{foo: int}')).toBe('isObjectShapeFldfooReqInt');
    expect(propose('array{foo: int}')).toBe('isShapeFldfooReqInt');
  });
});

describe('SequentialCheckNameProposer', () => {
  it('assigns check_N in order, ignoring type', () => {
    const proposer = new SequentialCheckNameProposer();
    expect(proposer.name(parseType('int'))).toBe('check_1');
    expect(proposer.name(parseType('string'))).toBe('check_2');
  });
});
