import { describe, expect, it } from 'vitest';
import type { TypeNode } from './ast.ts';
import { parseType } from './index.ts';
import errorCases from './testdata/parser.errors.json';
import successCases from './testdata/parser.success.json';

type ParseSuccessCase = { source: string; ast: TypeNode };
type ParseErrorCase = { input: string; messageContains?: string };

describe('parseType', () => {
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
