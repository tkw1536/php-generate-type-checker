import { describe, expect, it } from 'vitest';
import { ParseError } from '../parser/parser.ts';
import { renderErrorHtml } from './errorDisplay.ts';

function showsCaretAtParseErrorPosition(): void {
  const html = renderErrorHtml(
    {
      kind: 'parse',
      title: 'Parse error',
      message: 'Unexpected token ">"',
      pos: 17,
    },
    'array<string, int>>',
  );
  expect(html).toContain('error-display');
  expect(html).toContain('error-char');
  expect(html).toContain('error-caret');
  expect(html).toContain('Position 18');
}

function usesPlainInputBlockForGenerationErrors(): void {
  const html = renderErrorHtml(
    {
      kind: 'generation',
      title: 'Generation error',
      message:
        'Cannot generate a runtime check for the generic type Collection: not a supported generic for codegen',
      detail: 'Collection<...>',
    },
    'Collection<int>',
  );
  expect(html).toContain('error-source-plain');
  expect(html).not.toContain('error-caret');
}

function showsTypeIndexForMultiTypeParseErrors(): void {
  const html = renderErrorHtml(
    {
      kind: 'parse',
      title: 'Parse error',
      message: 'Unexpected token ">"',
      pos: 3,
      expressionIndex: 1,
    },
    'int array<string>>',
  );
  expect(html).toContain('Type 2');
}

function integratesWithParseError(): void {
  const err = new ParseError('Expected )', 5);
  const html = renderErrorHtml(
    {
      kind: 'parse',
      title: 'Parse error',
      message: err.message,
      pos: err.pos,
    },
    '(int|string',
  );
  expect(html).toContain('Expected )');
  expect(html).toContain('^');
}

describe('renderErrorHtml', () => {
  it('shows caret at parse error position', showsCaretAtParseErrorPosition);
  it(
    'uses plain input block for generation errors',
    usesPlainInputBlockForGenerationErrors,
  );
  it(
    'shows type index for multi-type parse errors',
    showsTypeIndexForMultiTypeParseErrors,
  );
  it('integrates with ParseError', integratesWithParseError);
});
