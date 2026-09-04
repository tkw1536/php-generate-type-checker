import { describe, expect, it } from 'vitest';
import { formatType } from './format.ts';
import { parseType, type TypeNode } from './index.ts';
import successCases from './testdata/parser.success.json';

type ParseSuccessCase = { readonly source: string; readonly ast: TypeNode };

function isParseSuccessCase(value: unknown): value is ParseSuccessCase {
  return (
    typeof value === 'object' &&
    value !== null &&
    'source' in value &&
    'ast' in value &&
    typeof value.source === 'string'
  );
}

function readSuccessCases(data: unknown): ParseSuccessCase[] {
  if (!Array.isArray(data) || !data.every((item) => isParseSuccessCase(item))) {
    throw new Error('invalid parser success fixture JSON');
  }
  return data;
}

const parsedSuccessCases = readSuccessCases(successCases);

describe('formatType', () => {
  describe('formatType(ast) equals source', () => {
    it.each(parsedSuccessCases)('$source', ({ source, ast }) => {
      const formatted = formatType(ast);
      expect(formatted).toEqual(source);
    });
  });

  describe('parseType(formatType(ast)) equals ast', () => {
    it.each(parsedSuccessCases)('$source', ({ ast }) => {
      const reParsed = parseType(formatType(ast));
      expect(reParsed).toEqual(ast);
    });
  });
});
