import { describe, expect, it } from 'vitest';
import { parseType, parseTypes } from '../parser/index.ts';
import { buildMany, optimize, renderChecker } from './pipeline.ts';

function namesEntryFromType(): void {
  const ast = parseType('int');
  const { ir } = buildMany([ast]);
  expect(ir.entries[0]).toBe('isInt');
}

function buildManyEmitsTwoEntryCheckers(): void {
  const { segments } = parseTypes('array<string>array<int>');
  const { ir, typesByName } = buildMany(segments.map((s) => s.ast));
  expect(ir.entries).toEqual(['isArrayString', 'isArrayInt']);
  const php = renderChecker(ir, {
    typeString: 'array<string>array<int>',
    typesByName,
    output: 'function',
  });
  expect(php).toContain('function isArrayString(');
  expect(php).toContain('function isArrayInt(');
}

function optimizeKeepsAllEntryCheckers(): void {
  const { segments } = parseTypes('string int');
  const { ir: built } = buildMany(segments.map((s) => s.ast));
  const optimized = optimize(built);
  expect(optimized.entries).toEqual(['isString', 'isInt']);
  expect(optimized.programs.isString).toBeDefined();
  expect(optimized.programs.isInt).toBeDefined();
}

function generatesBareNonEmptyArrayKeyword(): void {
  const ast = parseType('non-empty-array');
  const { ir, typesByName } = buildMany([ast]);
  const php = renderChecker(ir, {
    typeString: 'non-empty-array',
    typesByName,
    output: 'function',
  });
  expect(php).toContain('function isNonEmptyArray(');
  expect(php).toContain('if (!is_array($value))');
  expect(php).toContain('$value === []');
}

function callableArrayEmitsPerGuardFailIf(): void {
  const ast = parseType('callable-array');
  const { ir, typesByName } = buildMany([ast], {
    prioritizeReadabilityOverCompactness: true,
  });
  const php = renderChecker(ir, {
    typeString: 'callable-array',
    typesByName,
    output: 'function',
  });
  expect(php).toContain('if (!is_array($value))');
  expect(php).toContain('if (!is_callable($value))');
  expect(php).toContain('return TRUE;');
  expect(php).not.toMatch(/return !\(/u);
}

function unionIntStringEmitsFailIfOr(): void {
  const ast = parseType('int|string');
  const { ir, typesByName } = buildMany([ast], {
    prioritizeReadabilityOverCompactness: true,
  });
  const php = renderChecker(ir, {
    typeString: 'int|string',
    typesByName,
    output: 'function',
  });
  expect(php).toContain('if (!(is_int($value) || is_string($value)))');
  expect(php).toContain('return FALSE;');
  expect(php).toContain('return TRUE;');
}

function arrayNeverRequiresEmptyArray(): void {
  const ast = parseType('array<never>');
  const { ir, typesByName } = buildMany([ast], {
    prioritizeReadabilityOverCompactness: true,
  });
  const php = renderChecker(ir, {
    typeString: 'array<never>',
    typesByName,
    output: 'function',
  });
  expect(php).toContain('/** @phpstan-assert-if-true array<never> $value */');
  expect(php).toMatch(/\$value === \[\]/u);
}

function publicStaticEmitsSelfForHelpers(): void {
  const ast = parseType('array<int>|array<string>');
  const { ir, typesByName } = buildMany([ast], {
    prioritizeReadabilityOverCompactness: true,
  });
  const php = renderChecker(ir, {
    typeString: 'array<int>|array<string>',
    typesByName,
    output: 'public_static',
  });
  expect(php).toContain('class TypeChecker');
  expect(php).toContain('self::isArrayInt(');
  expect(php).toContain('self::isArrayString(');
}

function negativeIntHelperDocMatchesKeyword(): void {
  const ast = parseType('negative-int');
  const { ir, typesByName } = buildMany([ast], {
    prioritizeReadabilityOverCompactness: true,
  });
  const php = renderChecker(ir, {
    typeString: 'negative-int',
    typesByName,
    output: 'function',
  });
  expect(php).toContain('/** @phpstan-assert-if-true negative-int $value */');
  expect(php).toContain('if (!is_int($value))');
  expect(php).toContain('$value < 0');
}

function buildManyUsesInstanceofWithoutAliasMap(): void {
  const ast = parseType('Foo');
  const { ir, typesByName } = buildMany([ast]);
  const php = renderChecker(optimize(ir), {
    typeString: 'Foo',
    typesByName,
    output: 'function',
  });
  expect(php).toContain('$value instanceof Foo');
}

function classAndObjectShapeDropsRedundantIsObject(): void {
  const ast = parseType('\\stdClass&object{a: int}');
  const { ir, typesByName } = buildMany([ast]);
  const php = renderChecker(optimize(ir), {
    typeString: '\\stdClass&object{a: int}',
    typesByName,
    output: 'function',
  });
  expect(php).toContain('$value instanceof \\stdClass');
  expect(php).toContain("property_exists($value, 'a')");
  expect(php).toContain('is_int($value->a)');
  expect(php).not.toContain('is_object($value)');
}

function objectShapeAndClassDropsRedundantIsObject(): void {
  const ast = parseType('object{a: int}&\\stdClass');
  const { ir, typesByName } = buildMany([ast]);
  const php = renderChecker(optimize(ir), {
    typeString: 'object{a: int}&\\stdClass',
    typesByName,
    output: 'function',
  });
  expect(php).toContain('$value instanceof \\stdClass');
  expect(php).toContain("property_exists($value, 'a')");
  expect(php).toContain('is_int($value->a)');
  expect(php).not.toContain('is_object($value)');
  expect(php.indexOf('instanceof')).toBeLessThan(php.indexOf('property_exists'));
}

describe('pipeline build + render', () => {
  it('names entry from type', namesEntryFromType);
  it(
    'buildMany emits two entry checkers for array<string>array<int>',
    buildManyEmitsTwoEntryCheckers,
  );
  it(
    'optimize keeps all entry checkers for multi-type IR',
    optimizeKeepsAllEntryCheckers,
  );
  it('generates bare non-empty-array keyword', generatesBareNonEmptyArrayKeyword);
  it(
    'callable-array emits per-guard fail-if, not negated and',
    callableArrayEmitsPerGuardFailIf,
  );
  it(
    'union-int|string emits fail-if or then return true without optimize',
    unionIntStringEmitsFailIfOr,
  );
  it('array<never> requires empty array', arrayNeverRequiresEmptyArray);
  it(
    'public_static emits self:: for helper calls',
    publicStaticEmitsSelfForHelpers,
  );
  it(
    'negative-int helper doc matches parsed keyword',
    negativeIntHelperDocMatchesKeyword,
  );
  it(
    'buildMany uses instanceof for named types without alias map',
    buildManyUsesInstanceofWithoutAliasMap,
  );
  it(
    'class&object shape drops redundant is_object after instanceof',
    classAndObjectShapeDropsRedundantIsObject,
  );
  it(
    'object shape&class reorders instanceof before props and drops is_object',
    objectShapeAndClassDropsRedundantIsObject,
  );
});
