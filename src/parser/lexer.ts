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
  | 'lparen'
  | 'rparen'
  | 'dot'
  | 'ellipsis'
  | 'eof';

export interface Token {
  type: TokenType;
  value: string;
  pos: number;
}

export class LexerError extends Error {
  readonly pos: number;

  constructor(message: string, pos: number) {
    super(message);
    this.name = 'LexerError';
    this.pos = pos;
  }
}

export function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  const peek = (offset = 0): string => input[i + offset] ?? '';

  while (i < input.length) {
    const ch = input[i];

    if (/\s/.test(ch)) {
      i++;
      continue;
    }

    const start = i;

    if (ch === '<') {
      tokens.push({ type: 'lt', value: '<', pos: start });
      i++;
      continue;
    }
    if (ch === '>') {
      tokens.push({ type: 'gt', value: '>', pos: start });
      i++;
      continue;
    }
    if (ch === '{') {
      tokens.push({ type: 'lbrace', value: '{', pos: start });
      i++;
      continue;
    }
    if (ch === '}') {
      tokens.push({ type: 'rbrace', value: '}', pos: start });
      i++;
      continue;
    }
    if (ch === '[') {
      tokens.push({ type: 'lbracket', value: '[', pos: start });
      i++;
      continue;
    }
    if (ch === ']') {
      tokens.push({ type: 'rbracket', value: ']', pos: start });
      i++;
      continue;
    }
    if (ch === '|') {
      tokens.push({ type: 'pipe', value: '|', pos: start });
      i++;
      continue;
    }
    if (ch === '&') {
      tokens.push({ type: 'amp', value: '&', pos: start });
      i++;
      continue;
    }
    if (ch === ',') {
      tokens.push({ type: 'comma', value: ',', pos: start });
      i++;
      continue;
    }
    if (ch === ':') {
      tokens.push({ type: 'colon', value: ':', pos: start });
      i++;
      continue;
    }
    if (ch === '?') {
      tokens.push({ type: 'question', value: '?', pos: start });
      i++;
      continue;
    }
    if (ch === '(') {
      tokens.push({ type: 'lparen', value: '(', pos: start });
      i++;
      continue;
    }
    if (ch === ')') {
      tokens.push({ type: 'rparen', value: ')', pos: start });
      i++;
      continue;
    }
    if (ch === '.') {
      if (peek(1) === '.' && peek(2) === '.') {
        tokens.push({ type: 'ellipsis', value: '...', pos: start });
        i += 3;
        continue;
      }
      tokens.push({ type: 'dot', value: '.', pos: start });
      i++;
      continue;
    }

    if (ch === "'" || ch === '"') {
      const quote = ch;
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
      tokens.push({ type: 'string', value, pos: start });
      continue;
    }

    if (/[0-9]/.test(ch) || (ch === '-' && /[0-9]/.test(peek(1)))) {
      let value = '';
      if (ch === '-') {
        value += ch;
        i++;
      }
      while (i < input.length && /[0-9]/.test(input[i])) {
        value += input[i];
        i++;
      }
      if (input[i] === '.') {
        value += input[i];
        i++;
        while (i < input.length && /[0-9]/.test(input[i])) {
          value += input[i];
          i++;
        }
      }
      tokens.push({ type: 'number', value, pos: start });
      continue;
    }

    if (ch === '$' || ch === '\\' || /[a-zA-Z_]/.test(ch)) {
      let value = '';
      if (ch === '\\') {
        value += ch;
        i++;
      }
      while (i < input.length) {
        const c = input[i];
        if (c === '\\') {
          value += c;
          i++;
          if (i < input.length && /[a-zA-Z_]/.test(input[i])) {
            value += input[i];
            i++;
          }
          continue;
        }
        if (/[a-zA-Z0-9_$\-]/.test(c)) {
          value += c;
          i++;
          continue;
        }
        break;
      }
      tokens.push({ type: 'identifier', value, pos: start });
      continue;
    }

    throw new LexerError(`Unexpected character: ${ch}`, start);
  }

  tokens.push({ type: 'eof', value: '', pos: i });
  return tokens;
}
