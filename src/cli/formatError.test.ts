import { describe, expect, it } from 'vitest';
import { ParseError } from '../parser/parseError.ts';
import { formatCliError } from './formatError.ts';

describe('formatCliError', () => {
  it('shows a caret under the parse error position', () => {
    const source = 'array{x: string,y: string,...string}';
    const err = new ParseError('Expected rbrace, got identifier', 29);
    const text = formatCliError(err, source);
    expect(text).toContain('Parse error: Expected rbrace, got identifier');
    expect(text).toContain(source);
    expect(text).toMatch(/ {29}\^/u);
    expect(text).toContain('Position 30 (column 30)');
  });

  it('labels multi-type parse errors with a type index', () => {
    const source = 'int array<string>>';
    const err = new ParseError('Unexpected token ">"', 3, 1);
    const text = formatCliError(err, source);
    expect(text).toContain('Type 2');
  });
});
