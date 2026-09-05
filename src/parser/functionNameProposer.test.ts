import { describe, expect, it } from 'vitest';
import { FunctionNameProposer } from './functionNameProposer.ts';
import { parseType } from './index.ts';

function propose(type: string): string {
  return new FunctionNameProposer().name(parseType(type));
}

function mapsInt(): void {
  expect(propose('int')).toBe('isInt');
}

function mapsArrayNever(): void {
  expect(propose('array<never>')).toBe('isArrayNever');
}

function mapsUnion(): void {
  expect(propose('array<int>|array<string>')).toBe('isArrayIntArrayString');
}

function mapsIterableAndArray(): void {
  expect(propose('iterable<string>')).toBe('isIterableString');
  expect(propose('array<string>')).toBe('isArrayString');
}

function mapsNonEmptyCollections(): void {
  expect(propose('non-empty-array<string>')).toBe('isNonEmptyArrayString');
  expect(propose('non-empty-list<int>')).toBe('isNonEmptyListInt');
}

function mapsKeyedArrayWithMixed(): void {
  expect(propose('array<string, mixed>')).toBe('isArrayStringMixed');
}

function mapsHyphenatedKeywords(): void {
  expect(propose('negative-int')).toBe('isNegativeInt');
}

function mapsBareArray(): void {
  expect(propose('array')).toBe('isArray');
}

function mapsShapes(): void {
  expect(propose('object{foo: int}')).toBe('isObjectFooInt');
  expect(propose('array{foo: int}')).toBe('isArrayFooInt');
}

function preservesClassNameCasing(): void {
  expect(propose('MyClass')).toBe('isMyClass');
  expect(propose('DateTimeInterface')).toBe('isDateTimeInterface');
  expect(propose('\\Fully\\Qualified\\ClassName')).toBe(
    'isFullyQualifiedClassName',
  );
  expect(propose('class-string<MyClass>')).toBe('isClassStringMyClass');
}

function mapsConstantKeywords(): void {
  expect(propose('TRUE')).toBe('isTrue');
  expect(propose('FALSE')).toBe('isFalse');
  expect(propose('NULL')).toBe('isNull');
}

describe('FunctionNameProposer', () => {
  it('maps int to isInt', mapsInt);
  it('maps array<never> from formatted type string', mapsArrayNever);
  it('maps union from formatted type string', mapsUnion);
  it('maps iterable<string>', mapsIterableAndArray);
  it('maps non-empty collection keywords', mapsNonEmptyCollections);
  it('maps keyed array with mixed', mapsKeyedArrayWithMixed);
  it('maps keywords with hyphens', mapsHyphenatedKeywords);
  it('maps bare array keyword', mapsBareArray);
  it('maps shapes from formatted string', mapsShapes);
  it('preserves class name casing', preservesClassNameCasing);
  it('maps TRUE/FALSE/NULL constants to isTrue-style names', mapsConstantKeywords);
});
