import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  packExamplesPhp,
  renameExampleHarness,
} from '../examples/pack.ts';
import { parseType } from '../parser/index.ts';
import { parseCheckerInput } from '../parser/parseInput.ts';
import {
  parseExamplesGoldenPhp,
  type ExamplesGoldenCase,
  type ExamplesGoldenMeta,
} from './testdata/examplesGolden.ts';
import { SUCCESS_GOLDEN_STEMS } from './testdata/goldenCase.ts';
import { readInSourceLines } from './testdata/readInSources.ts';

const TESTDATA_DIR = path.join(import.meta.dirname, 'testdata');

const EXAMPLES_STEMS = SUCCESS_GOLDEN_STEMS.filter(
  (stem) =>
    stem === 'function' ||
    stem === 'docblock' ||
    stem === 'docblock_emit_aliases' ||
    stem === 'multi_comment' ||
    stem === 'verbose_phpdoc' ||
    stem === 'sealed_shapes',
);

function packPlainOrThrow(
  meta: ExamplesGoldenMeta,
  requireClass: readonly string[],
): string {
  const body = packExamplesPhp(parseType(meta.input), { requireClass });
  if (body === null) {
    throw new Error('golden case was omitted but still present in file');
  }
  return body;
}

function packEntriesOrThrow(
  meta: ExamplesGoldenMeta,
  requireClass: readonly string[],
): string {
  const entries = parseCheckerInput(meta.input);
  if (entries.length === 0) {
    return '// no examples\n';
  }
  const packed: string[] = [];
  for (const entry of entries) {
    const body = packExamplesPhp(entry.ast, { requireClass });
    if (body !== null) {
      packed.push(body);
    }
  }
  if (packed.length === 0) {
    throw new Error('golden case was omitted but still present in file');
  }
  if (packed.length === 1) {
    const only = packed[0];
    if (only === undefined) {
      throw new Error('never reached');
    }
    return only;
  }
  return packed
    .map((body, index) => renameExampleHarness(body, index))
    .join('\n');
}

function rebuildExpected(meta: ExamplesGoldenMeta): string {
  const requireClass = meta.requireClass ?? [];
  try {
    return packPlainOrThrow(meta, requireClass);
  } catch {
    return packEntriesOrThrow(meta, requireClass);
  }
}

type ExamplesCaseRow = {
  readonly name: string;
  readonly meta: ExamplesGoldenMeta;
  readonly expected: string;
};

function toCaseRow(stem: string, item: ExamplesGoldenCase): ExamplesCaseRow {
  return {
    name: `${stem}: ${item.meta.input.slice(0, 60)}`,
    meta: item.meta,
    expected: item.expected,
  };
}

describe('examples goldens', () => {
  for (const stem of EXAMPLES_STEMS) {
    const filePath = path.join(TESTDATA_DIR, `${stem}.examples.golden.php`);
    const cases = parseExamplesGoldenPhp(
      readFileSync(filePath, 'utf8'),
      stem,
    ).map((item) => toCaseRow(stem, item));
    it.each(cases)('$name', (item: ExamplesCaseRow) => {
      expect(rebuildExpected(item.meta)).toBe(item.expected);
    });
  }

  it('function.IN RequireClass annotations round-trip', () => {
    const lines = readInSourceLines(path.join(TESTDATA_DIR, 'function.IN'));
    const foo = lines.find((l) => l.input === 'Foo');
    expect(foo?.requireClass).toEqual(['Foo']);
  });
});
