import { describe, expect, it } from 'vitest';
import {
  isAllowedNamedType,
  isPseudoNamedType,
  isValidPhpClassName,
} from './phpClassName.ts';

describe('isValidPhpClassName', () => {
  it.each([
    'Foo',
    'Bar_Baz',
    '_Private',
    '\\Foo',
    '\\Foo\\Bar',
    'Foo\\Bar',
  ])('accepts %s', (name) => {
    expect(isValidPhpClassName(name)).toBe(true);
  });

  it.each([
    '',
    '\\',
    'i-am-not-a-valid-class',
    'Foo-Bar',
    'Foo$Bar',
    '1Foo',
    'Foo\\',
    '\\Foo\\',
  ])('rejects %s', (name) => {
    expect(isValidPhpClassName(name)).toBe(false);
  });
});

describe('pseudo named types', () => {
  it.each([
    'open-resource',
    'closed-resource',
    'callable-array',
    'callable-object',
  ])('allows %s as named type', (name) => {
    expect(isPseudoNamedType(name)).toBe(true);
    expect(isAllowedNamedType(name)).toBe(true);
    expect(isValidPhpClassName(name)).toBe(false);
  });

  it('treats OPEN-RESOURCE as a pseudo named type', () => {
    expect(isPseudoNamedType('OPEN-RESOURCE')).toBe(true);
    expect(isAllowedNamedType('OPEN-RESOURCE')).toBe(true);
  });
});
