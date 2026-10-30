import { describe, expect, it } from 'vitest';
import { parseInSourceLine } from './readInSources.ts';

describe('parseInSourceLine', () => {
  it('returns null for blanks and comments', () => {
    expect(parseInSourceLine('')).toBeNull();
    expect(parseInSourceLine('  # section')).toBeNull();
  });

  it('parses a bare type line', () => {
    expect(parseInSourceLine('int')).toEqual({
      input: 'int',
      requireClass: [],
    });
  });

  it('strips same-line RequireClass', () => {
    expect(parseInSourceLine('Foo  # RequireClass: Foo')).toEqual({
      input: 'Foo',
      requireClass: ['Foo'],
    });
    expect(
      parseInSourceLine('Foo|Bar  # RequireClass: Foo, Bar'),
    ).toEqual({
      input: 'Foo|Bar',
      requireClass: ['Foo', 'Bar'],
    });
    expect(
      parseInSourceLine('\\Foo\\Bar  # RequireClass: \\Foo\\Bar'),
    ).toEqual({
      input: '\\Foo\\Bar',
      requireClass: ['\\Foo\\Bar'],
    });
  });
});
