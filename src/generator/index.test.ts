import { describe, expect, it } from 'vitest';
import { generateChecker, generateDocblockChecker } from './index.ts';
import { GenerationError } from './errors.ts';
import type { CheckerOutputMode } from './render/output.ts';
import docblockCases from './testdata/docblock.json';
import docblockEmitAliasesCases from './testdata/docblock_emit_aliases.json';
import errorsCases from './testdata/errors.json';
import functionCases from './testdata/function.json';
import privateStaticCases from './testdata/private_static.json';
import protectedStaticCases from './testdata/protected_static.json';
import publicStaticCases from './testdata/public_static.json';

interface GeneratorFixture {
  readonly name: string;
  readonly input: string;
  readonly output: CheckerOutputMode;
  readonly expected: string;
  readonly expectsError: boolean;
  readonly emitPhpstanTypeAliases?: boolean;
  readonly docblock?: boolean;
}

type SuccessCase = { readonly input: string; readonly expected: string };
type DocblockCase = {
  readonly input: string;
  readonly output: CheckerOutputMode;
  readonly expected: string;
  readonly emitPhpstanTypeAliases?: boolean;
};
type ErrorCase = { readonly input: string };

function successToFixtures(
  cases: readonly SuccessCase[],
  output: CheckerOutputMode,
): GeneratorFixture[] {
  return cases.map(({ input, expected }) => ({
    name: output === 'function' ? input : `${output}: ${input}`,
    input,
    output,
    expected,
    expectsError: false,
  }));
}

function docblockToFixtures(cases: readonly DocblockCase[]): GeneratorFixture[] {
  return cases.map(({ input, output, expected, emitPhpstanTypeAliases }) => {
    const label =
      output === 'function' && !emitPhpstanTypeAliases
        ? 'docblock: post list API'
        : `docblock: ${output}${emitPhpstanTypeAliases ? ' + aliases' : ''}`;
    return {
      name: label,
      input,
      output,
      expected,
      expectsError: false,
      emitPhpstanTypeAliases,
      docblock: true,
    };
  });
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

function isSuccessCase(value: unknown): value is SuccessCase {
  return (
    typeof value === 'object' &&
    value !== null &&
    'input' in value &&
    'expected' in value &&
    typeof value.input === 'string' &&
    typeof value.expected === 'string'
  );
}

function isDocblockCase(value: unknown): value is DocblockCase {
  return (
    typeof value === 'object' &&
    value !== null &&
    'input' in value &&
    'output' in value &&
    'expected' in value &&
    typeof value.input === 'string' &&
    typeof value.output === 'string' &&
    typeof value.expected === 'string'
  );
}

function isErrorCase(value: unknown): value is ErrorCase {
  return (
    typeof value === 'object' &&
    value !== null &&
    'input' in value &&
    typeof value.input === 'string'
  );
}

function readSuccessCases(data: unknown): SuccessCase[] {
  if (!Array.isArray(data) || !data.every(isSuccessCase)) {
    throw new Error('invalid success fixture JSON');
  }
  return data;
}

function readDocblockCases(data: unknown): DocblockCase[] {
  if (!Array.isArray(data) || !data.every(isDocblockCase)) {
    throw new Error('invalid docblock fixture JSON');
  }
  return data;
}

function readErrorCases(data: unknown): ErrorCase[] {
  if (!Array.isArray(data) || !data.every(isErrorCase)) {
    throw new Error('invalid error fixture JSON');
  }
  return data;
}

/** All generator golden fixtures from `generator/testdata/*.json`. */
export function loadFixtures(): GeneratorFixture[] {
  return [
    ...successToFixtures(readSuccessCases(functionCases), 'function'),
    ...successToFixtures(readSuccessCases(publicStaticCases), 'public_static'),
    ...successToFixtures(
      readSuccessCases(protectedStaticCases),
      'protected_static',
    ),
    ...successToFixtures(readSuccessCases(privateStaticCases), 'private_static'),
    ...docblockToFixtures(readDocblockCases(docblockCases)),
    ...docblockToFixtures(readDocblockCases(docblockEmitAliasesCases)),
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

  it.each(successFixtures.filter((fixture) => fixture.docblock))(
    '$name',
    (fixture) => {
      expect(
        generateDocblockChecker(fixture.input, {
          output: fixture.output,
          emitPhpstanTypeAliases: fixture.emitPhpstanTypeAliases,
        }),
      ).toBe(fixture.expected);
    },
  );

  it.each(successFixtures.filter((fixture) => !fixture.docblock))(
    '$name',
    (fixture) => {
      expect(generateChecker(fixture.input, { output: fixture.output })).toBe(
        fixture.expected,
      );
    },
  );
});
