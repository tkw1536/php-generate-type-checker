import { describe, expect, it } from 'vitest';
import { parseType } from '../parser/index.ts';
import { formatType } from '../parser/format.ts';
import { generateChecker } from './index.ts';
import { unsealArrayShapesInType } from './unsealArrayShapes.ts';

describe('unsealArrayShapesInType', () => {
  it('adds bare ... to sealed array and list shapes', () => {
    expect(formatType(unsealArrayShapesInType(parseType('array{foo: int}')))).toBe(
      'array{foo: int, ...}',
    );
    expect(
      formatType(unsealArrayShapesInType(parseType('list{int, string}'))),
    ).toBe('list{int, string, ...}');
  });

  it('leaves already-unsealed and object shapes alone', () => {
    expect(
      formatType(unsealArrayShapesInType(parseType('array{foo: int, ...}'))),
    ).toBe('array{foo: int, ...}');
    expect(
      formatType(
        unsealArrayShapesInType(parseType('array{foo: int, ...<string>}')),
      ),
    ).toBe('array{foo: int, ...<string>}');
    expect(
      formatType(unsealArrayShapesInType(parseType('object{foo: int}'))),
    ).toBe('object{foo: int}');
  });

  it('unseals nested shapes', () => {
    expect(
      formatType(
        unsealArrayShapesInType(parseType('array{outer: array{inner: string}}')),
      ),
    ).toBe('array{outer: array{inner: string, ...}, ...}');
  });
});

describe('generateChecker unsealArrayShapes', () => {
  it('omits sealed count check when unseal is on', () => {
    const sealed = generateChecker('array{foo: int}');
    const unsealed = generateChecker('array{foo: int}', {
      unsealArrayShapes: true,
    });
    expect(sealed).toContain('count($value) === 1');
    expect(unsealed).not.toContain('count(');
    // Assert docs keep the input type; only codegen is unsealed.
    expect(unsealed).toContain(
      '@phpstan-assert-if-true array{foo: int} $value',
    );
    expect(unsealed).not.toContain('array{foo: int, ...}');
  });
});
