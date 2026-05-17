import { describe, expect, it } from 'vitest';
import { ParseError } from '../parser/parser.ts';
import { renderErrorHtml } from './errorDisplay.ts';

describe('renderErrorHtml', () => {
  it('shows caret at parse error position', () => {
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
  });

  it('uses plain input block for generation errors', () => {
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
  });

  it('shows type index for multi-type parse errors', () => {
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
  });

  it('integrates with ParseError', () => {
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
  });
});
