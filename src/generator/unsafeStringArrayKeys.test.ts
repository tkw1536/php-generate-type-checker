import { describe, expect, it } from 'vitest';
import { parseType } from '../parser/index.ts';
import { formatType } from '../parser/format.ts';
import { generateChecker } from './index.ts';
import { unsafeStringArrayKeysInType } from './unsafeStringArrayKeys.ts';

function rewritten(source: string): string {
  return formatType(unsafeStringArrayKeysInType(parseType(source)));
}

describe('unsafeStringArrayKeysInType', () => {
  it('rewrites exact string keys on array and non-empty-array', () => {
    expect(rewritten('array<string, int>')).toBe(
      'array<int|non-decimal-int-string, int>',
    );
    expect(rewritten('non-empty-array<string, bool>')).toBe(
      'non-empty-array<int|non-decimal-int-string, bool>',
    );
  });

  it('rewrites nested string keys', () => {
    expect(rewritten('array<string, array<string, int>>')).toBe(
      'array<int|non-decimal-int-string, array<int|non-decimal-int-string, int>>',
    );
  });

  it('leaves non-string keys, lists, and value-only arrays alone', () => {
    expect(rewritten('array<int, string>')).toBe('array<int, string>');
    expect(rewritten('array<non-empty-string, int>')).toBe(
      'array<non-empty-string, int>',
    );
    expect(rewritten('list<string>')).toBe('list<string>');
    expect(rewritten('array<string>')).toBe('array<string>');
  });

  it('does not rewrite shape rest string keys', () => {
    expect(rewritten('array{foo: int, ...<string>}')).toBe(
      'array{foo: int, ...<string>}',
    );
    expect(rewritten('array{foo: int, ...<string, bool>}')).toBe(
      'array{foo: int, ...<string, bool>}',
    );
  });
});

describe('generateChecker unsafeStringArrayKeys', () => {
  it('drops string key check while keeping assert docs', () => {
    const strict = generateChecker('array<string, int>');
    const detect = generateChecker('array<string, int>', {
      unsafeStringArrayKeys: true,
    });
    expect(strict).toContain('!is_string($key)');
    expect(detect).not.toContain('is_string($key)');
    expect(detect).toContain(
      '@phpstan-assert-if-true array<string, int> $value',
    );
    expect(detect).not.toContain('int|non-decimal-int-string');
  });
});
