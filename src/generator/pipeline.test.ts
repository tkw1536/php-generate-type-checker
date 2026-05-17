import { describe, expect, it } from 'vitest';
import { parseType } from '../parser/index.ts';
import { build, renderChecker } from './pipeline.ts';

/** Phase 1: built IR only (no optimizer). */
describe('pipeline build + render (unoptimized)', () => {
  it('names entry from type when nameFunctionsByType is default', () => {
    const ast = parseType('int');
    const { ir } = build(ast);
    expect(ir.order[0]).toBe('isInt');
  });

  it('uses check entry when nameFunctionsByType is false', () => {
    const ast = parseType('int');
    const { ir } = build(ast, { nameFunctionsByType: false });
    expect(ir.order[0]).toBe('check');
  });

  it('generates bare non-empty-array keyword', () => {
    const ast = parseType('non-empty-array');
    const { ir, typesByName } = build(ast);
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
    const { ir, typesByName } = build(ast, {
      prioritizeReadabilityOverCompactness: true,
    });
    const php = renderChecker(ir, {
      typeString: 'callable-array',
      typesByName,
      output: 'function',
    });
    expect(php).toContain('if (!is_array($value))');
    expect(php).toContain('if (!is_callable($value))');
    expect(php).toContain('return true;');
    expect(php).not.toMatch(/return !\(/);
  });

  it('union-int|string emits return or without optimize', () => {
    const ast = parseType('int|string');
    const { ir, typesByName } = build(ast, {
      prioritizeReadabilityOverCompactness: true,
    });
    const php = renderChecker(ir, {
      typeString: 'int|string',
      typesByName,
      output: 'function',
    });
    expect(php).toContain('return (is_int($value) || is_string($value));');
  });

  it('array<string,string> foreach uses separate fail-if guards', () => {
    const ast = parseType('array<string,string>');
    const { ir, typesByName } = build(ast, {
      prioritizeReadabilityOverCompactness: true,
    });
    const php = renderChecker(ir, {
      typeString: 'array<string,string>',
      typesByName,
      output: 'function',
    });
    expect(php).toContain('foreach ($value as $key1 => $value1)');
    expect(php).toContain('if (!is_string($key1)');
    expect(php).toContain('if (!is_string($value1)');
    expect(php).not.toContain('!(is_string($key1) && is_string($value1))');
  });

  it('array<never> requires empty array', () => {
    const ast = parseType('array<never>');
    const { ir, typesByName } = build(ast, {
      prioritizeReadabilityOverCompactness: true,
    });
    const php = renderChecker(ir, {
      typeString: 'array<never>',
      typesByName,
      output: 'function',
    });
    expect(php).toContain('/** @phpstan-assert-if-true array<never> $value */');
    expect(php).toMatch(/\$value === \[\]/);
  });

  it('public_static emits self:: for helper calls', () => {
    const ast = parseType('array<int>|array<string>');
    const { ir, typesByName } = build(ast, {
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
    const { ir, typesByName } = build(ast, {
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
});
