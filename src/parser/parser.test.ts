import { describe, expect, it } from 'vitest';
import type { TypeNode } from './ast.ts';
import { parseType, parseTypes } from './index.ts';
import errorCases from './testdata/parser.errors.json';
import successCases from './testdata/parser.success.json';

type ParseSuccessCase = { source: string; ast: TypeNode };
type ParseErrorCase = { input: string; messageContains?: string };

describe('parseTypes', () => {
  it('splits array<string>array<int> into two segments', () => {
    const result = parseTypes('array<string>array<int>');
    expect(result.segments).toHaveLength(2);
    expect(result.source.slice(result.segments[0].start, result.segments[0].end)).toBe(
      'array<string>',
    );
    expect(result.source.slice(result.segments[1].start, result.segments[1].end)).toBe(
      'array<int>',
    );
    expect(result.segments[0].ast).toEqual(parseType('array<string>'));
    expect(result.segments[1].ast).toEqual(parseType('array<int>'));
  });

  it('splits string int into two segments', () => {
    const result = parseTypes('string int');
    expect(result.segments).toHaveLength(2);
    expect(result.segments[0].ast).toEqual(parseType('string'));
    expect(result.segments[1].ast).toEqual(parseType('int'));
  });

  it('keeps stringint as one class segment', () => {
    const result = parseTypes('stringint');
    expect(result.segments).toHaveLength(1);
    expect(result.segments[0].ast).toEqual(parseType('stringint'));
  });

  it('keeps union as one segment', () => {
    const result = parseTypes('int|string');
    expect(result.segments).toHaveLength(1);
    expect(result.segments[0].ast).toEqual(parseType('int|string'));
  });
});

describe('parseType', () => {
  describe('nullable ? prefix', () => {
    const cases: [string, string][] = [
      ['?int', 'int|null'],
      ['?int|string', 'int|null|string'],
      ['?(int|string)', '(int|string)|null'],
      ['?int[]', '(int[])|null'],
      ['array{foo: ?int}', 'array{foo: int|null}'],
      ['array{?int}', 'array{int|null}'],
      ['array{bar?: ?string}', 'array{bar?: string|null}'],
      ['list{?int}', 'list{int|null}'],
    ];

    for (const [source, expectedSource] of cases) {
      it(source, () => {
        expect(parseType(source)).toEqual(parseType(expectedSource));
      });
    }

    it('array{bar?: string} still parses optional shape fields', () => {
      expect(parseType('array{bar?: string}')).toEqual(
        parseType('array{bar?: string}'),
      );
    });
  });

  describe('success', () => {
    for (const { source, ast } of successCases as ParseSuccessCase[]) {
      it(source, () => {
        expect(parseType(source)).toEqual(ast);
      });
    }
  });

  describe('errors', () => {
    for (const { input, messageContains } of errorCases as ParseErrorCase[]) {
      const label = input === '' ? '(empty)' : input;
      it(label, () => {
        const run = () => parseType(input);
        if (messageContains !== undefined) {
          expect(run).toThrow(new RegExp(messageContains));
        } else {
          expect(run).toThrow();
        }
      });
    }
  });
});
