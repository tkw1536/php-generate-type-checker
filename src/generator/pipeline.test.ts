import { describe, expect, it } from 'vitest';
import {
  parsePhpstanTypesFromDocblock,
  parseType,
  parseTypes,
} from '../parser/index.ts';
import { buildMany, buildManyNamed, optimize, renderChecker } from './pipeline.ts';

/** Phase 1: built IR only (no optimizer). */
describe('pipeline build + render (unoptimized)', () => {
  it('names entry from type when nameFunctionsByType is default', () => {
    const ast = parseType('int');
    const { ir } = buildMany([ast]);
    expect(ir.entries[0]).toBe('isInt');
  });

  it('uses check entry when nameFunctionsByType is false', () => {
    const ast = parseType('int');
    const { ir } = buildMany([ast], { nameFunctionsByType: false });
    expect(ir.entries[0]).toBe('check');
  });

  it('buildMany emits two entry checkers for array<string>array<int>', () => {
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
  });

  it('optimize keeps all entry checkers for multi-type IR', () => {
    const { segments } = parseTypes('string int');
    const { ir: built } = buildMany(segments.map((s) => s.ast));
    const optimized = optimize(built);
    expect(optimized.entries).toEqual(['isString', 'isInt']);
    expect(optimized.programs.isString).toBeDefined();
    expect(optimized.programs.isInt).toBeDefined();
  });

  it('generates bare non-empty-array keyword', () => {
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
  });

  it('callable-array emits per-guard fail-if, not negated and', () => {
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
  });

  it('union-int|string emits fail-if or then return true without optimize', () => {
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
  });

  it('array<never> requires empty array', () => {
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
  });

  it('public_static emits self:: for helper calls', () => {
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
  });

  it('negative-int helper doc matches parsed keyword', () => {
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
  });

  it('buildManyNamed delegates to entry checkers for alias cross-references', () => {
    const defs = parsePhpstanTypesFromDocblock(`/**
 * @phpstan-type PostSummary array{id: int, title: string}
 * @phpstan-type PostListResponse array{posts: list<PostSummary>}
 */`);
    const { ir, typesByName, docStringsByName } = buildManyNamed(
      defs.map((d) => ({
        name: d.name,
        type: d.ast,
        typeString: d.typeString,
      })),
    );
    const php = renderChecker(optimize(ir), {
      typeString: 'docblock',
      typesByName,
      docStringsByName,
      output: 'function',
    });
    expect(php).toContain('isPostSummary(');
  });

  it('buildManyNamed names entries from @phpstan-type aliases', () => {
    const defs = parsePhpstanTypesFromDocblock(`/**
 * @phpstan-type PostSummary array{id: int, title: string}
 * @phpstan-type PostListResponse array{posts: list<PostSummary>}
 */`);
    const { ir, typesByName, docStringsByName } = buildManyNamed(
      defs.map((d) => ({
        name: d.name,
        type: d.ast,
        typeString: d.typeString,
      })),
    );
    expect(ir.entries).toEqual(['isPostSummary', 'isPostListResponse']);
    const php = renderChecker(ir, {
      typeString: 'docblock',
      typesByName,
      docStringsByName,
      output: 'function',
    });
    expect(php).toContain('function isPostSummary(');
    expect(php).toContain('function isPostListResponse(');
    expect(php).toContain('@phpstan-assert-if-true PostSummary $value');
    expect(php).toContain('@phpstan-assert-if-true PostListResponse $value');
  });

  it('prepends @phpstan-type aliases when emitPhpstanTypeAliases is true', () => {
    const defs = parsePhpstanTypesFromDocblock(`/**
 * @phpstan-type PostSummary array{id: int, title: string}
 * @phpstan-type PostListResponse array{posts: list<PostSummary>}
 */`);
    const { ir, typesByName, docStringsByName, phpstanTypeAliases } =
      buildManyNamed(
        defs.map((d) => ({
          name: d.name,
          type: d.ast,
          typeString: d.typeString,
        })),
      );
    const php = renderChecker(ir, {
      typeString: 'docblock',
      typesByName,
      docStringsByName,
      phpstanTypeAliases,
      emitPhpstanTypeAliases: true,
      output: 'function',
    });
    expect(php.startsWith('/**\n * @phpstan-type PostSummary')).toBe(true);
    expect(php).toContain(
      '@phpstan-type PostListResponse array{posts: list<PostSummary>}',
    );
    expect(php).toContain('function isPostSummary(');
    expect(php.indexOf('@phpstan-type PostSummary')).toBeLessThan(
      php.indexOf('function isPostSummary('),
    );
  });

  it('does not prepend aliases when emitPhpstanTypeAliases is false', () => {
    const defs = parsePhpstanTypesFromDocblock('/** @phpstan-type Foo int */');
    const { ir, typesByName, docStringsByName, phpstanTypeAliases } =
      buildManyNamed(
        defs.map((d) => ({
          name: d.name,
          type: d.ast,
          typeString: d.typeString,
        })),
      );
    const php = renderChecker(ir, {
      typeString: 'docblock',
      typesByName,
      docStringsByName,
      phpstanTypeAliases,
      emitPhpstanTypeAliases: false,
      output: 'function',
    });
    expect(php.startsWith('/** @phpstan-assert-if-true Foo $value */')).toBe(true);
  });

  it('buildMany uses instanceof for named types without alias map', () => {
    const ast = parseType('Foo');
    const { ir, typesByName } = buildMany([ast]);
    const php = renderChecker(optimize(ir), {
      typeString: 'Foo',
      typesByName,
      output: 'function',
    });
    expect(php).toContain('$value instanceof Foo');
  });

  it('buildManyNamed uses sequential check names when nameFunctionsByType is false', () => {
    const defs = parsePhpstanTypesFromDocblock(`/**
 * @phpstan-type Foo int
 * @phpstan-type Bar string
 */`);
    const { ir } = buildManyNamed(
      defs.map((d) => ({ name: d.name, type: d.ast })),
      { nameFunctionsByType: false },
    );
    expect(ir.entries).toEqual(['check', 'check_1']);
  });
});
