import { describe, expect, it } from 'vitest';
import { parseType } from '../../parser/index.ts';
import { generateChecker } from '../index.ts';
import { buildMany, renderChecker } from '../pipeline.ts';

function protectedStaticEntryIsProtected(): void {
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
}

function publicStaticEntryIsPublic(): void {
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
}

function privateStaticEntryIsPrivate(): void {
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
}

describe('class output visibility', () => {
  it(
    'protected_static entry is protected and helpers are private static',
    protectedStaticEntryIsProtected,
  );
  it(
    'public_static entry is public and helpers stay private static',
    publicStaticEntryIsPublic,
  );
  it(
    'private_static entry is private and helpers are private static',
    privateStaticEntryIsPrivate,
  );
});

describe('verbose PHPDoc', () => {
  it('emits a one-line assert by default', () => {
    const php = generateChecker('string');
    expect(php.startsWith('/** @phpstan-assert-if-true string $value */')).toBe(
      true,
    );
    expect(php).not.toContain('@return');
  });

  it('emits Drupal-style PHPDoc with a/an for function output', () => {
    const php = generateChecker('array<string, bool>', { verbosePhpdoc: true });
    expect(php).toContain(
      'Checks if the given value is an array<string, bool>.',
    );
    expect(php).toContain('@param mixed $value');
    expect(php).toContain('The value to check.');
    expect(php).toContain('@return bool');
    expect(php).toContain(
      'TRUE if the given value is an array<string, bool>.',
    );
    expect(php).toContain(
      '@phpstan-assert-if-true array<string, bool> $value',
    );
  });

  it('uses a (not an) when the type starts with a consonant', () => {
    const php = generateChecker('string', { verbosePhpdoc: true });
    expect(php).toContain('Checks if the given value is a string.');
    expect(php).toContain('TRUE if the given value is a string.');
  });

  it('indents verbose PHPDoc on class methods', () => {
    const php = generateChecker('int', {
      verbosePhpdoc: true,
      output: 'public_static',
    });
    expect(php).toMatch(/^\s{4}\/\*\*$/mu);
    expect(php).toMatch(/^\s{4} \* Checks if the given value is an int\.$/mu);
    expect(php).toMatch(/^\s{4} \* @return bool$/mu);
    expect(php).toMatch(/^\s{4} \* @phpstan-assert-if-true int \$value$/mu);
  });
});
