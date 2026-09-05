import { describe, expect, it } from 'vitest';
import { generateChecker } from '../index.ts';
import { buildMany, renderChecker } from '../pipeline.ts';
import { parseType } from "../../parser/index.ts";

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

function emitsOneLineAssertByDefault(): void {
  const php = generateChecker('string');
  expect(php.startsWith('/** @phpstan-assert-if-true string $value */')).toBe(
    true,
  );
  expect(php).not.toContain('@return');
}

function emitsDrupalStylePhpdocWithArticle(): void {
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
}

function usesANotAnForConsonant(): void {
  const php = generateChecker('string', { verbosePhpdoc: true });
  expect(php).toContain('Checks if the given value is a string.');
  expect(php).toContain('TRUE if the given value is a string.');
}

function indentsVerbosePhpdocOnClassMethods(): void {
  const php = generateChecker('int', {
    verbosePhpdoc: true,
    output: 'public_static',
  });
  expect(php).toMatch(/^\/\*\*$/mu);
  expect(php).toContain(' * Provides type checker methods.');
  expect(php).toMatch(/^class TypeChecker$/mu);
  expect(php).toMatch(/^\s{4}\/\*\*$/mu);
  expect(php).toMatch(/^\s{4} \* Checks if the given value is an int\.$/mu);
  expect(php).toMatch(/^\s{4} \* @return bool$/mu);
  expect(php).toMatch(/^\s{4} \* @phpstan-assert-if-true int \$value$/mu);
}

function mergesClassSummaryAndAliasesWhenVerbose(): void {
  const php = generateChecker('/** @phpstan-type Foo int */', {
    verbosePhpdoc: true,
    output: 'public_static',
    emitPhpstanTypeAliases: true,
  });
  expect(
    php.startsWith(
      '/**\n * Provides type checker methods.\n *\n * @phpstan-type Foo int\n */\nclass TypeChecker',
    ),
  ).toBe(true);
  expect(php).not.toContain('*/\n\nclass TypeChecker');
}

function emitsAliasesAboveClassWithoutBlankLine(): void {
  const php = generateChecker('/** @phpstan-type Foo int */', {
    output: 'public_static',
    emitPhpstanTypeAliases: true,
  });
  expect(
    php.startsWith('/**\n * @phpstan-type Foo int\n */\nclass TypeChecker'),
  ).toBe(true);
  expect(php).not.toContain('*/\n\nclass TypeChecker');
}

describe('verbose PHPDoc', () => {
  it('emits a one-line assert by default', emitsOneLineAssertByDefault);
  it(
    'emits Drupal-style PHPDoc with a/an for function output',
    emitsDrupalStylePhpdocWithArticle,
  );
  it(
    'uses a (not an) when the type starts with a consonant',
    usesANotAnForConsonant,
  );
  it(
    'indents verbose PHPDoc on class methods',
    indentsVerbosePhpdocOnClassMethods,
  );
  it(
    'puts class summary and aliases in one docblock when verbose',
    mergesClassSummaryAndAliasesWhenVerbose,
  );
  it(
    'emits aliases above class with no blank line when not verbose',
    emitsAliasesAboveClassWithoutBlankLine,
  );
});
