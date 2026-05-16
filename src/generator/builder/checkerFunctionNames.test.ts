import { describe, expect, it } from 'vitest';
import { parseType } from '../../parser/index.ts';
import { normalizeNode } from '../normalize.ts';
import { typeDedupeKey } from '../typeKey.ts';
import {
  CheckerFunctionNameRegistry,
  toIsFunctionIdentifier,
  typeToPascalSlug,
} from './checkerFunctionNames.ts';
import { sortFlattenedUnionMembers } from '../unionOrder.ts';

describe('typeToPascalSlug', () => {
  it('maps int to Int', () => {
    expect(typeToPascalSlug(normalizeNode(parseType('int')))).toBe('Int');
  });

  it('maps array<never> to ArrayNever', () => {
    expect(typeToPascalSlug(normalizeNode(parseType('array<never>')))).toBe(
      'ArrayNever',
    );
  });

  it('orders union members like sortFlattenedUnionMembers', () => {
    const u = normalizeNode(parseType('array<int>|array<string>'));
    const members = sortFlattenedUnionMembers(u);
    const slugParts = members.map(typeToPascalSlug);
    expect(typeToPascalSlug(u)).toBe(slugParts.join('Or'));
  });
  it('uses Iterable prefix for lowered iterable<T> (not array<T>)', () => {
    expect(
      typeToPascalSlug(normalizeNode(parseType('iterable<string>'))),
    ).toBe('IterableString');
    expect(typeToPascalSlug(normalizeNode(parseType('array<string>')))).toBe(
      'ArrayString',
    );
  });

  it('prefixes NonEmpty for non-empty-array and non-empty-list', () => {
    expect(
      typeToPascalSlug(normalizeNode(parseType('non-empty-array<string>'))),
    ).toBe('NonEmptyArrayString');
    expect(
      typeToPascalSlug(normalizeNode(parseType('non-empty-list<int>'))),
    ).toBe('NonEmptyListInt');
  });

  it('uses Mixed in slugs without a Type suffix', () => {
    expect(
      typeToPascalSlug(normalizeNode(parseType('array<string, mixed>'))),
    ).toBe('ArrayStringToMixed');
  });

  it('slugs int_range with Ge/Le and Neg for negative bounds', () => {
    expect(typeToPascalSlug(normalizeNode(parseType('negative-int')))).toBe(
      'IntLeNeg1',
    );
    expect(typeToPascalSlug(normalizeNode(parseType('int<-3, -1>')))).toBe(
      'IntGeNeg3LeNeg1',
    );
  });
});

describe('toIsFunctionIdentifier', () => {
  it('prefixes is and keeps PascalCase', () => {
    expect(toIsFunctionIdentifier('Int')).toBe('isInt');
    expect(toIsFunctionIdentifier('ArrayNever')).toBe('isArrayNever');
  });
});

describe('CheckerFunctionNameRegistry', () => {
  it('disambiguates different dedupe keys that share the same slug', () => {
    const a = normalizeNode(parseType('\\Vendor\\A\\Foo'));
    const b = normalizeNode(parseType('\\Vendor\\B\\Foo'));
    expect(typeToPascalSlug(a)).toBe(typeToPascalSlug(b));
    expect(typeDedupeKey(a)).not.toBe(typeDedupeKey(b));

    const r = new CheckerFunctionNameRegistry();
    expect(r.allocate(typeDedupeKey(a), a)).toBe('isFoo');
    expect(r.allocate(typeDedupeKey(b), b)).toBe('isFoo_2');
  });

  it('returns the same name for the same dedupe key', () => {
    const a = normalizeNode(parseType('int'));
    const k = typeDedupeKey(a);
    const r = new CheckerFunctionNameRegistry();
    expect(r.allocate(k, a)).toBe(r.allocate(k, a));
  });

  it('escapes primitive array to avoid reserved “Array” slug', () => {
    const a = normalizeNode(parseType('array'));
    const slug = typeToPascalSlug(a);
    expect(slug).toBe('ArrayType');
    expect(toIsFunctionIdentifier(slug)).toBe('isArrayType');
  });

  it('prefixes object shapes with ObjectShape (distinct from array shapes)', () => {
    expect(
      typeToPascalSlug(normalizeNode(parseType('object{foo: int}'))),
    ).toBe('ObjectShapeFldfooReqInt');
    expect(
      typeToPascalSlug(normalizeNode(parseType('array{foo: int}'))),
    ).toBe('ShapeFldfooReqInt');
  });
});
