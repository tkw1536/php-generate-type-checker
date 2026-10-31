import { describe, expect, it } from 'vitest';
import { parseType } from '../parser/index.ts';
import { generateExamples } from './generate.ts';
import { renderPhpValue } from './render.ts';
import { packExamplesPhp } from './pack.ts';

function exprs(type: string): readonly string[] {
  return generateExamples(parseType(type)).map((v) => renderPhpValue(v));
}

describe('generateExamples scalars', () => {
  it('returns multiple ints for int', () => {
    const out = exprs('int');
    expect(out.length).toBeGreaterThan(1);
    expect(out).toContain('0');
    expect(out).toContain('1');
  });

  it('filters positive-int', () => {
    const out = exprs('positive-int');
    expect(out).not.toContain('0');
    expect(out).not.toContain('-1');
    expect(out.length).toBeGreaterThan(0);
  });

  it('uses string literals as-is', () => {
    expect(exprs("'foo'")).toEqual(["'foo'"]);
  });

  it('returns no examples for never / named classes', () => {
    expect(exprs('never')).toEqual([]);
    expect(exprs('Foo')).toEqual([]);
  });

  it('unions concatenate arm examples', () => {
    const out = exprs('int|string');
    expect(out).toEqual(expect.arrayContaining(['0', "'a'"]));
  });
});

describe('generateExamples shapes', () => {
  it('builds list and shape examples', () => {
    const list = exprs('list<int>');
    expect(list).toContain('[]');
    expect(list).toContain('[1]');
    const shape = exprs('array{foo: int}');
    expect(shape).toEqual(
      expect.arrayContaining([expect.stringContaining("'foo'")]),
    );
  });

  it('builds object shape examples as (object)[…]', () => {
    const shape = exprs('object{foo: int}');
    expect(shape.length).toBeGreaterThan(0);
    expect(shape.every((s) => s.startsWith('(object)['))).toBe(true);
    expect(shape).toEqual(
      expect.arrayContaining([expect.stringContaining("'foo'")]),
    );
    expect(exprs('object')).toEqual(['(object)[]']);
    expect(exprs('object{}')).toEqual(['(object)[]']);
  });

  it('special-cases \\stdClass&object (and object shapes)', () => {
    expect(exprs('\\stdClass&object')).toEqual(['(object)[]']);
    expect(exprs('object&\\stdClass')).toEqual(['(object)[]']);
    expect(exprs('stdClass&object')).toEqual(['(object)[]']);
    const shaped = exprs('\\stdClass&object{a: int}');
    expect(shaped.length).toBeGreaterThan(0);
    expect(shaped.every((s) => s.startsWith('(object)['))).toBe(true);
    expect(shaped).toEqual(
      expect.arrayContaining([expect.stringContaining("'a'")]),
    );
    expect(exprs('object{a: int}&\\stdClass')).toEqual(shaped);
  });

  it('returns empty for other intersections', () => {
    expect(exprs('int&string')).toEqual([]);
    expect(exprs('array&object')).toEqual([]);
  });
});

describe('packExamplesPhp', () => {
  it('emits dumpType harness for int', () => {
    const body = packExamplesPhp(parseType('int'));
    expect(body).toContain(
      "function example(mixed $value): bool { die('example'); }",
    );
    expect(body).toContain(
      '/** @return ($value is int ? true : false) */',
    );
    expect(body).toContain('\\PHPStan\\dumpType(example(0));');
    expect(body).not.toContain('assert(');
  });

  it('returns null when RequireClass is set', () => {
    expect(
      packExamplesPhp(parseType('Foo'), { requireClass: ['Foo'] }),
    ).toBeNull();
  });

  it('returns null for unresolved named types', () => {
    expect(packExamplesPhp(parseType('Foo|int'))).toBeNull();
  });

  it('emits no examples comment when empty', () => {
    expect(packExamplesPhp(parseType('never'))).toBe('// no examples\n');
  });
});
