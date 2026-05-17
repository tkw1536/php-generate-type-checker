import { describe, expect, it } from 'vitest';
import { formatType } from './format.ts';
import { parseType, type TypeNode } from './index.ts';
import successCases from './testdata/parser.success.json';

type ParseSuccessCase = { source: string; ast: TypeNode };

describe('formatType', () => {
  describe('formatType(ast) equals source', () => {
    for (const { source, ast } of (successCases as ParseSuccessCase[])) {
      it(source, () => {
        const formatted = formatType(ast);
        expect(formatted).toEqual(source);
      });
    }
  });

  describe('parseType(formatType(ast)) equals ast', () => {
    for (const { source, ast } of (successCases as ParseSuccessCase[])) {
      it(source, () => {
        const reParsed = parseType(formatType(ast));
        expect(reParsed).toEqual(ast);
      });
    }
  });
});
