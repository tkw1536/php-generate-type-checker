import { describe, expect, it } from 'vitest';
import { parseType } from '../parser/index.ts';
import { generateExamples } from './generate.ts';
import { generateNonExamples } from './generate.non.ts';
import { renderPhpValue } from './render.ts';
import { packExamplesPhp, renameExampleHarness } from './pack.ts';

function exprs(type: string): readonly string[] {
  return generateExamples(parseType(type)).map((v) => renderPhpValue(v));
}

function nonExprs(type: string): readonly string[] {
  return generateNonExamples(parseType(type)).map((v) => renderPhpValue(v));
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

describe('generateNonExamples scalars', () => {
  it('rejects ints outside positive-int', () => {
    const out = nonExprs('positive-int');
    expect(out).toEqual(expect.arrayContaining(['0', '-1']));
    expect(out).not.toContain('1');
  });

  it('returns empty counterexamples for mixed', () => {
    expect(nonExprs('mixed')).toEqual([]);
  });

  it('union counterexamples must fail every arm', () => {
    const out = nonExprs('int|string');
    expect(out).not.toContain('0');
    expect(out).not.toContain("'a'");
    expect(out).toEqual(expect.arrayContaining(['null', 'true', '[]']));
  });

  it('packs counterexamples for never', () => {
    expect(exprs('never')).toEqual([]);
    expect(nonExprs('never').length).toBeGreaterThan(0);
  });
});

describe('generateExamples maps', () => {
  it('omits non-empty maps when all keys cast to int (decimal-int-string)', () => {
    expect(exprs('array<decimal-int-string, mixed>')).toEqual(['[]']);
  });

  it('keeps non-empty maps for non-decimal-int-string keys', () => {
    const out = exprs('array<non-decimal-int-string, mixed>');
    expect(out).toContain('[]');
    expect(out).toEqual(
      expect.arrayContaining([expect.stringMatching(/=>/u)]),
    );
  });

  it('keeps int-keyed maps for int|decimal-int-string keys', () => {
    const out = exprs('array<int|decimal-int-string, string>');
    expect(out).toContain('[]');
    expect(out).toEqual(
      expect.arrayContaining([expect.stringMatching(/^\[\d+\s*=>/u)]),
    );
    const joined = out.join('\n');
    expect(joined).not.toMatch(/'0'\s*=>/u);
    expect(joined).not.toMatch(/'42'\s*=>/u);
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

describe('generateExamples shape optionals', () => {
  it('includes optional keys in at least one positive', () => {
    const shape = exprs('array{foo: int, bar?: string}');
    expect(shape).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/'foo'\s*=>/u),
        expect.stringMatching(/'bar'\s*=>/u),
        expect.stringMatching(/^\['foo'\s*=>/u),
      ]),
    );
  });

  it('fills every optional in one positive when several exist', () => {
    expect(exprs('array{a: int, b?: string, c?: int}')).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/'b'\s*=>.*'c'\s*=>/u),
      ]),
    );
  });
});

describe('generateNonExamples shapes', () => {
  it('emits wrong-typed and missing members for array shapes', () => {
    const out = nonExprs('array{foo: int}');
    expect(out).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/'foo'\s*=>/u),
        '[]',
      ]),
    );
    expect(out).toContain("['foo' => null]");
  });

  it('emits wrong-typed optional members for array shapes', () => {
    const out = nonExprs('array{foo: int, bar?: string}');
    expect(out).toContain("['foo' => 0, 'bar' => null]");
  });

  it('emits wrong-typed and missing members for object shapes', () => {
    const out = nonExprs('object{foo: int}');
    expect(out).toContain('(object)[]');
    expect(out).toContain("(object)['foo' => null]");
  });
});

describe('packExamplesPhp omit', () => {
  it('returns null when RequireClass is set', () => {
    expect(
      packExamplesPhp(parseType('Foo'), { requireClass: ['Foo'] }),
    ).toBeNull();
  });

  it('returns null for unresolved named types', () => {
    expect(packExamplesPhp(parseType('Foo|int'))).toBeNull();
  });
});

describe('packExamplesPhp harness', () => {
  it('emits dumpType harness for int with counterexamples', () => {
    const body = packExamplesPhp(parseType('int'));
    expect(body).toContain(
      "function example(mixed $value): bool { die('example'); }",
    );
    expect(body).toContain(
      '/** @return ($value is int ? true : false) */',
    );
    expect(body).toContain('\\PHPStan\\dumpType(example(0));');
    expect(body).toContain('\\PHPStan\\dumpType(!example(null));');
    expect(body).not.toContain('assert(');
  });

  it('omits counterexamples for mixed', () => {
    const body = packExamplesPhp(parseType('mixed'));
    expect(body).toContain('dumpType(example(');
    expect(body).not.toContain('!example(');
  });

  it('packs counterexamples-only harness for never', () => {
    const body = packExamplesPhp(parseType('never'));
    expect(body).toEqual(expect.any(String));
    expect(body).not.toBe('');
    expect(body).toContain('!example(');
    expect(body).not.toMatch(/dumpType\(example\(/u);
  });
});

describe('renameExampleHarness', () => {
  it('renames !example call sites', () => {
    const body = packExamplesPhp(parseType('int'));
    expect(body).toEqual(expect.stringContaining('!example('));
    const renamed = renameExampleHarness(String(body), 3);
    expect(renamed).toContain('function example3(');
    expect(renamed).toContain('dumpType(example3(');
    expect(renamed).toContain('dumpType(!example3(');
    expect(renamed).not.toContain('dumpType(example(');
    expect(renamed).not.toContain('dumpType(!example(');
  });
});
