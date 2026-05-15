import { describe, expect, it } from 'vitest';
import { GenerationError, generateChecker } from '../generator/index.ts';
import { wrapChecker } from '../generator/php.ts';
import { parseGeneratorFixture } from './loadGeneratorFixture.ts';

const fixtureModules = import.meta.glob('./fixtures/generator/*.fixture', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const fixtures = Object.entries(fixtureModules)
  .map(([path, content]) => {
    const name = path.split('/').pop() ?? path;
    return parseGeneratorFixture(content, name);
  })
  .sort((a, b) => a.name.localeCompare(b.name));

describe('generateChecker fixtures', () => {
  for (const fixture of fixtures) {
    if (fixture.expectsError) {
      it(fixture.name, () => {
        expect(() => generateChecker(fixture.input)).toThrow(GenerationError);
      });
      continue;
    }

    it(fixture.name, () => {
      const expected = wrapChecker(fixture.input, fixture.expectedBody);
      const actual = generateChecker(fixture.input);
      expect(actual).toBe(expected);
    });
  }
});
