import { describe, expect, it } from 'vitest';
import { parseType } from '../../parser/index.ts';
import { buildMany, renderChecker } from '../pipeline.ts';

describe('class output visibility', () => {
  it('protected_static entry is protected and helpers are private static', () => {
    const ast = parseType('array<int>|array<string>');
    const { ir, typesByName } = buildMany([ast], {
      prioritizeReadabilityOverCompactness: true,
    });
    const php = renderChecker(ir, {
      typeString: 'array<int>|array<string>',
      typesByName,
      output: 'protected_static',
    });
    expect(php).toContain(
      'protected static function isArrayIntArrayString(mixed $value): bool',
    );
    expect(php).toContain('private static function isArrayInt(');
    expect(php).toContain('private static function isArrayString(');
    expect(php).not.toMatch(/protected static function isArrayInt\(/u);
    expect(php).not.toMatch(/public static function isArrayInt\(/u);
    expect(php).toMatch(
      /^\s{4}\/\*\* @phpstan-assert-if-true array<int> \$value \*\/$/mu,
    );
    expect(php).toMatch(
      /^\s{4}\/\*\* @phpstan-assert-if-true array<string> \$value \*\/$/mu,
    );
  });

  it('public_static entry is public and helpers stay private static', () => {
    const ast = parseType('array<int>|array<string>');
    const { ir, typesByName } = buildMany([ast], {
      prioritizeReadabilityOverCompactness: true,
    });
    const php = renderChecker(ir, {
      typeString: 'x',
      typesByName,
      output: 'public_static',
    });
    expect(php).toContain(
      'public static function isArrayIntArrayString(mixed $value): bool',
    );
    expect(php).toContain('private static function isArrayInt(');
    expect(php).not.toContain('public static function isArrayInt(');
  });

  it('private_static entry is private and helpers are private static', () => {
    const ast = parseType('int');
    const { ir, typesByName } = buildMany([ast]);
    const php = renderChecker(ir, {
      typeString: 'int',
      typesByName,
      output: 'private_static',
    });
    expect(php).toContain('private static function isInt(');
    expect(php).not.toContain('public static function');
    expect(php).not.toContain('protected static function');
  });
});
