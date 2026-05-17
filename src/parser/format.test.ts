import { describe, expect, it } from 'vitest';
import { formatType } from './format.ts';
import { parseType } from './index.ts';

const expressions = [
  '(array<string, int|null>|null)&Foo',
  '(int|string)',
  '42',
  'A&B&C',
  'A&B|C',
  '\\Foo\\Bar',
  "'foo'|'bar'",
  'array',
  'array<string, array<int, bool>>',
  'array<int>',
  'array<int, Foo>',
  'array<string, int>',
  'array{0: int, 1?: string}',
  'array{"field-one": int}',
  'array{count: positive-int}',
  'array{foo: int, bar?: string}',
  'bool',
  'callable',
  'callable(float ...$floats): (int|null)',
  'callable(float...): (int|null)',
  'callable(int $a, string $b): bool',
  'callable(int, int=): string',
  'callable(int, int): string',
  'callable(string &$bar): mixed',
  'callable(string &$x): void',
  'callable(): void',
  'class-string',
  'DateTimeInterface',
  'decimal-int-string',
  'false',
  'float',
  'Foo&Bar',
  'int',
  'int<0, 100>',
  'int<50, max>',
  'int<min, 100>',
  'int<min, max>',
  'int|string|null',
  'int|array<string, bool>',
  'integer<0, 5>',
  'iterable<int, string>',
  'iterable<string>',
  'list{int, string}',
  'list<int>',
  'mixed',
  'non-empty-array<string>',
  'non-empty-list<string>',
  'non-empty-lowercase-string',
  'non-empty-string',
  'non-falsy-string',
  'null',
  'object',
  'object{foo: int, bar?: string}',
  'positive-int',
  'string',
  'string[]',
  'string[][]',
  'true',
];

describe('formatType', () => {
  describe('parseType(formatType(node)) equals node', () => {
    for (const expression of expressions) {
      it(expression, () => {
        const node = parseType(expression);
        const reParsed = parseType(formatType(node));
        expect(reParsed).toEqual(node);
      });
    }
  });
});
