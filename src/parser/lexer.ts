export type TokenType =
  | 'identifier'
  | 'number'
  | 'string'
  | 'lt'
  | 'gt'
  | 'lbrace'
  | 'rbrace'
  | 'lbracket'
  | 'rbracket'
  | 'pipe'
  | 'amp'
  | 'comma'
  | 'colon'
  | 'question'
  | 'equals'
  | 'lparen'
  | 'rparen'
  | 'dot'
  | 'ellipsis'
  | 'eof';

export interface Token {
  readonly type: TokenType;
  readonly value: string;
  readonly pos: number;
  /** Present on `string` tokens: which quote character wrapped the literal. */
  readonly quotes?: 'single' | 'double';
}

/** Mutable token sink for lexer helpers (prefer-readonly-parameter-types). */
type TokenList = {
  push(token: Token): number;
};

export class LexerError extends Error {
  readonly pos: number;

  constructor(message: string, pos: number) {
    super(message);
    this.name = 'LexerError';
    this.pos = pos;
  }
}

const SINGLE_CHAR_TOKENS: Readonly<Record<string, TokenType>> = {
  '<': 'lt',
  '>': 'gt',
  '{': 'lbrace',
  '}': 'rbrace',
  '[': 'lbracket',
  ']': 'rbracket',
  '|': 'pipe',
  '&': 'amp',
  ',': 'comma',
  ':': 'colon',
  '?': 'question',
  '=': 'equals',
  '(': 'lparen',
  ')': 'rparen',
};

export function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const peek = (offset = 0): string => input[i + offset] ?? '';

  while (i < input.length) {
    const ch = input[i];
    if (/\s/u.test(ch)) {
      i++;
      continue;
    }
    const start = i;
    const single = SINGLE_CHAR_TOKENS[ch];
    if (single !== undefined) {
      tokens.push({ type: single, value: ch, pos: start });
      i++;
      continue;
    }
    if (ch === '.') {
      i = pushDotOrEllipsis(tokens, i, start, peek);
      continue;
    }
    if (ch === "'" || ch === '"') {
      i = pushString(tokens, input, i, start, ch);
      continue;
    }
    if (/[0-9]/u.test(ch) || (ch === '-' && /[0-9]/u.test(peek(1)))) {
      i = pushNumber(tokens, input, i, start);
      continue;
    }
    if (ch === '$' || ch === '\\' || /[a-zA-Z_]/u.test(ch)) {
      const { value, nextIndex } = readIdentifier(input, i);
      i = nextIndex;
      tokens.push({ type: 'identifier', value, pos: start });
      continue;
    }
    throw new LexerError(`Unexpected character: ${ch}`, start);
  }

  tokens.push({ type: 'eof', value: '', pos: i });
  return tokens;
}

function pushDotOrEllipsis(
  tokens: TokenList,
  i: number,
  start: number,
  peek: (offset?: number) => string,
): number {
  if (peek(1) === '.' && peek(2) === '.') {
    tokens.push({ type: 'ellipsis', value: '...', pos: start });
    return i + 3;
  }
  tokens.push({ type: 'dot', value: '.', pos: start });
  return i + 1;
}

function pushString(
  tokens: TokenList,
  input: string,
  i: number,
  start: number,
  quote: string,
): number {
  i++;
  let value = '';
  while (i < input.length && input[i] !== quote) {
    if (input[i] === '\\' && i + 1 < input.length) {
      value += input[i + 1];
      i += 2;
      continue;
    }
    value += input[i];
    i++;
  }
  if (i >= input.length) {
    throw new LexerError('Unterminated string literal', start);
  }
  i++;
  tokens.push({
    type: 'string',
    value,
    pos: start,
    quotes: quote === "'" ? 'single' : 'double',
  });
  return i;
}

function pushNumber(
  tokens: TokenList,
  input: string,
  i: number,
  start: number,
): number {
  let value = '';
  if (input[i] === '-') {
    value += '-';
    i++;
  }
  while (i < input.length && /[0-9]/u.test(input[i])) {
    value += input[i];
    i++;
  }
  if (input[i] === '.') {
    value += '.';
    i++;
    while (i < input.length && /[0-9]/u.test(input[i])) {
      value += input[i];
      i++;
    }
  }
  tokens.push({ type: 'number', value, pos: start });
  return i;
}

function readIdentifier(
  input: string,
  startIndex: number,
): { value: string; nextIndex: number } {
  let i = startIndex;
  let value = '';
  if (input[i] === '\\') {
    value += '\\';
    i++;
  }
  while (i < input.length) {
    const c = input[i];
    if (c === '\\') {
      value += c;
      i++;
      if (i < input.length && /[a-zA-Z_]/u.test(input[i])) {
        value += input[i];
        i++;
      }
      continue;
    }
    if (/[a-zA-Z0-9_$-]/u.test(c)) {
      value += c;
      i++;
      continue;
    }
    break;
  }
  return { value, nextIndex: i };
}
