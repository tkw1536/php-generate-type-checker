import { describe, expect, it } from 'vitest';
import { GenerationError, generateChecker } from './index.ts';

import type { CheckerOutputMode } from './render/output.ts';
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
}

type SuccessCase = { input: string; expected: string };
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
    ...successToFixtures(functionCases as SuccessCase[], 'function'),
    ...successToFixtures(publicStaticCases as SuccessCase[], 'public_static'),
    ...successToFixtures(protectedStaticCases as SuccessCase[], 'protected_static'),
    ...successToFixtures(privateStaticCases as SuccessCase[], 'private_static'),
    ...errorsToFixtures(errorsCases as ErrorCase[]),
  ].sort((a, b) => a.name.localeCompare(b.name));
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
      expect(generateChecker(fixture.input, { output: fixture.output })).toBe(
        fixture.expected,
      );
    });
  }
});
