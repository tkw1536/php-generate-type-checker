import { describe, expect, it } from 'vitest';
import { parseType } from '../parser/index.ts';
import { parseParserFixture } from './loadParserFixture.ts';

const fixtureModules = import.meta.glob('./fixtures/parser/*.fixture', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const fixtures = Object.entries(fixtureModules)
  .map(([path, content]) => {
    const name = path.split('/').pop() ?? path;
    return parseParserFixture(content, name);
  })
  .sort((a, b) => a.name.localeCompare(b.name));

describe('parseType fixtures', () => {
  for (const fixture of fixtures) {
    if (fixture.expectsError) {
      it(fixture.name, () => {
        const run = () => parseType(fixture.input);
        if (fixture.errorContains) {
          expect(run).toThrow(new RegExp(fixture.errorContains));
        } else {
          expect(run).toThrow();
        }
      });
      continue;
    }

    it(fixture.name, () => {
      expect(parseType(fixture.input)).toEqual(fixture.expected);
    });
  }
});
