import { describe, expect, it } from 'vitest';
import { ParseError } from '../parser/parseError.ts';
import { describeError, renderErrorHtml } from './errorDisplay.ts';

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
  // pos 17 is the first `>` of `>>` — caret must sit under that character.
  expect(html).toMatch(/error-char[^>]*>&gt;<\/span>/u);
  expect(html).toMatch(/error-caret"> {17}\^/u);
}

function pointsCaretAtGtAfterIncompleteUnion(): void {
  const source = 'array<int|>';
  const err = new ParseError('Expected type, got ">"', 10);
  const html = renderErrorHtml(describeError(err), source);
  expect(html).toContain('Position 11');
  expect(html).toMatch(/error-char[^>]*>&gt;<\/span>/u);
  expect(html).toMatch(/error-caret"> {10}\^/u);
}

function pointsCaretAtEofAfterTrailingPipe(): void {
  const source = 'int|';
  const err = new ParseError('Expected type, got "end of input"', 4);
  const html = renderErrorHtml(describeError(err), source);
  expect(html).toContain('Position 5');
  expect(html).toContain('error-cursor-marker');
  expect(html).toMatch(/error-caret"> {4}\^/u);
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
    'points caret at `>` after incomplete union inside generics',
    pointsCaretAtGtAfterIncompleteUnion,
  );
  it(
    'points caret at end of input after trailing pipe',
    pointsCaretAtEofAfterTrailingPipe,
  );
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
