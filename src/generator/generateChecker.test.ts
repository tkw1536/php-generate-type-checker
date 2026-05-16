import { describe, expect, it } from 'vitest';
import { GenerationError, generateChecker } from './index.ts';
import { parseGeneratorFixture } from '../support/loadGeneratorFixture.ts';

const fixtureModules = import.meta.glob('../support/fixtures/generator/*.fixture', {
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

describe('legacy function naming (nameFunctionsByType: false)', () => {
  it('emits check and numbered helpers', () => {
    const php = generateChecker('array<int>|array<string>', {
      output: 'function',
      nameFunctionsByType: false,
    });
    expect(php).toContain('function check(mixed $value): bool');
    expect(php).toContain('function check_1(');
    expect(php).toContain('function check_2(');
    expect(php).toContain('check_1($value)');
    expect(php).toContain('check_2($value)');
  });
});
