import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { generateChecker } from './index.ts';
import { GenerationError } from './errors.ts';
import errorsCases from './testdata/errors.json';
import {
  SUCCESS_GOLDEN_STEMS,
  type GoldenCase,
  type GoldenCaseMeta,
} from './testdata/goldenCase.ts';
import { parseGoldenPhp } from './testdata/goldenPhp.ts';
import type { CheckerOutputMode } from './options.ts';

interface GeneratorFixture {
  readonly name: string;
  readonly input: string;
  readonly output: CheckerOutputMode;
  readonly expected: string;
  readonly expectsError: boolean;
  readonly emitPhpstanTypeAliases?: boolean;
  readonly verbosePhpdoc?: boolean;
  readonly sealArrayShapes?: boolean;
}

type ErrorCase = { readonly input: string };

const TESTDATA_DIR = path.join(import.meta.dirname, 'testdata');

const MODE_STEMS = new Set([
  'function',
  'public_static',
  'protected_static',
  'private_static',
]);

function isErrorCase(value: unknown): value is ErrorCase {
  return (
    typeof value === 'object' &&
    value !== null &&
    'input' in value &&
    typeof value.input === 'string'
  );
}

function readErrorCases(data: unknown): ErrorCase[] {
  if (!Array.isArray(data) || !data.every((item) => isErrorCase(item))) {
    throw new Error('invalid error fixture JSON');
  }
  return data;
}

function fixtureName(
  stem: string,
  meta: GoldenCaseMeta,
  index: number,
  suiteSize: number,
): string {
  if (MODE_STEMS.has(stem)) {
    return meta.output === 'function'
      ? meta.input
      : `${meta.output}: ${meta.input}`;
  }
  const extras = [
    meta.emitPhpstanTypeAliases === true ? ' + aliases' : '',
    meta.verbosePhpdoc === true ? ' + verbose' : '',
    meta.sealArrayShapes === true ? ' + seal' : '',
  ].join('');
  return suiteSize === 1
    ? `${stem}: ${meta.output}${extras}`
    : `${stem}[${index}]: ${meta.output}${extras}`;
}

function caseToFixture(
  stem: string,
  item: GoldenCase,
  index: number,
  suiteSize: number,
): GeneratorFixture {
  const { meta, expected } = item;
  return {
    name: fixtureName(stem, meta, index, suiteSize),
    input: meta.input,
    output: meta.output,
    expected,
    expectsError: false,
    ...(meta.emitPhpstanTypeAliases === true
      ? { emitPhpstanTypeAliases: true }
      : {}),
    ...(meta.verbosePhpdoc === true ? { verbosePhpdoc: true } : {}),
    ...(meta.sealArrayShapes === true ? { sealArrayShapes: true } : {}),
  };
}

function loadGoldenSuite(stem: string): GeneratorFixture[] {
  const filePath = path.join(TESTDATA_DIR, `${stem}.golden.php`);
  const cases = parseGoldenPhp(readFileSync(filePath, 'utf8'));
  return cases.map((item, index) =>
    caseToFixture(stem, item, index, cases.length),
  );
}

function errorsToFixtures(cases: readonly ErrorCase[]): GeneratorFixture[] {
  return cases.map(({ input }) => ({
    name: `error: ${input}`,
    input,
    output: 'function' as const,
    expected: '',
    expectsError: true,
  }));
}

/** All generator golden fixtures from `testdata/*.golden.php` (+ `errors.json`). */
export function loadFixtures(): GeneratorFixture[] {
  return [
    ...SUCCESS_GOLDEN_STEMS.flatMap((stem) => loadGoldenSuite(stem)),
    ...errorsToFixtures(readErrorCases(errorsCases)),
  ].toSorted((a, b) => a.name.localeCompare(b.name));
}

const fixtures = loadFixtures();
const errorFixtures = fixtures.filter((fixture) => fixture.expectsError);
const successFixtures = fixtures.filter((fixture) => !fixture.expectsError);

describe('generateChecker fixtures', () => {
  it.each(errorFixtures)('$name', (fixture) => {
    expect(() =>
      generateChecker(fixture.input, { output: fixture.output }),
    ).toThrow(GenerationError);
  });

  it.each(successFixtures)('$name', (fixture) => {
    expect(
      generateChecker(fixture.input, {
        output: fixture.output,
        emitPhpstanTypeAliases: fixture.emitPhpstanTypeAliases,
        verbosePhpdoc: fixture.verbosePhpdoc,
        sealArrayShapes: fixture.sealArrayShapes,
      }),
    ).toBe(fixture.expected);
  });
});
