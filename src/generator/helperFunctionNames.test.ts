import { describe, expect, it } from 'vitest';
import { parseType } from '../parser/index.ts';
import { normalizeNode } from './normalize.ts';
import { typeDedupeKey } from './typeKey.ts';
import {
  IsFunctionNameRegistry,
  toIsFunctionIdentifier,
  typeToPascalSlug,
} from './helperFunctionNames.ts';
import { sortFlattenedUnionMembers } from './unionOrder.ts';

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
});

describe('toIsFunctionIdentifier', () => {
  it('prefixes is and keeps PascalCase', () => {
    expect(toIsFunctionIdentifier('Int')).toBe('isInt');
    expect(toIsFunctionIdentifier('ArrayNever')).toBe('isArrayNever');
  });
});

describe('IsFunctionNameRegistry', () => {
  it('disambiguates different dedupe keys that share the same slug', () => {
    const a = normalizeNode(parseType('\\Vendor\\A\\Foo'));
    const b = normalizeNode(parseType('\\Vendor\\B\\Foo'));
    expect(typeToPascalSlug(a)).toBe(typeToPascalSlug(b));
    expect(typeDedupeKey(a)).not.toBe(typeDedupeKey(b));

    const r = new IsFunctionNameRegistry();
    expect(r.allocate(typeDedupeKey(a), a)).toBe('isFoo');
    expect(r.allocate(typeDedupeKey(b), b)).toBe('isFoo_2');
  });

  it('returns the same name for the same dedupe key', () => {
    const a = normalizeNode(parseType('int'));
    const k = typeDedupeKey(a);
    const r = new IsFunctionNameRegistry();
    expect(r.allocate(k, a)).toBe(r.allocate(k, a));
  });

  it('escapes primitive array to avoid reserved “Array” slug', () => {
    const a = normalizeNode(parseType('array'));
    const slug = typeToPascalSlug(a);
    expect(slug).toBe('ArrayType');
    expect(toIsFunctionIdentifier(slug)).toBe('isArrayType');
  });
});
