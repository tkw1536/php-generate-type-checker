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
  name: string;
  input: string;
  output: CheckerOutputMode;
  expected: string;
  expectsError: boolean;
  emitPhpstanTypeAliases?: boolean;
  docblock?: boolean;
}

type SuccessCase = { input: string; expected: string };
type DocblockCase = {
  input: string;
  output: CheckerOutputMode;
  expected: string;
  emitPhpstanTypeAliases?: boolean;
};
type ErrorCase = { input: string };

function successToFixtures(
  cases: SuccessCase[],
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

function docblockToFixtures(cases: DocblockCase[]): GeneratorFixture[] {
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

function errorsToFixtures(cases: ErrorCase[]): GeneratorFixture[] {
  return cases.map(({ input }) => ({
    name: `error: ${input}`,
    input,
    output: 'function',
    expected: '',
    expectsError: true,
  }));
}

/** All generator golden fixtures from `generator/testdata/*.json`. */
export function loadFixtures(): GeneratorFixture[] {
  return [
    ...successToFixtures(functionCases, 'function'),
    ...successToFixtures(publicStaticCases, 'public_static'),
    ...successToFixtures(protectedStaticCases, 'protected_static'),
    ...successToFixtures(privateStaticCases, 'private_static'),
    ...docblockToFixtures(docblockCases as DocblockCase[]),
    ...docblockToFixtures(docblockEmitAliasesCases as DocblockCase[]),
    ...errorsToFixtures(errorsCases),
  ].toSorted((a, b) => a.name.localeCompare(b.name));
}


const fixtures = loadFixtures();

describe('generateChecker fixtures', () => {
  for (const fixture of fixtures) {
    if (fixture.expectsError) {
      it(fixture.name, () => {
        expect(() =>
          generateChecker(fixture.input, { output: fixture.output }),
        ).toThrow(GenerationError);
      });
      continue;
    }

    it(fixture.name, () => {
      if (fixture.docblock) {
        expect(
          generateDocblockChecker(fixture.input, {
            output: fixture.output,
            emitPhpstanTypeAliases: fixture.emitPhpstanTypeAliases,
          }),
        ).toBe(fixture.expected);
        return;
      }

      expect(generateChecker(fixture.input, { output: fixture.output })).toBe(
        fixture.expected,
      );
    });
  }
});
