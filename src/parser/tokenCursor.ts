import type { Token } from './lexer.ts';
import { ParseError } from './parseError.ts';

/** Shared token navigation for the PHPStan type parser. */
export class TokenCursor {
  protected index = 0;
  protected readonly tokens: readonly Token[];

  constructor(tokens: readonly Token[]) {
    this.tokens = tokens;
  }

  expect(type: Token['type']): Token {
    if (this.check(type)) {
      return this.advance();
    }
    throw new ParseError(`Expected ${type}, got ${this.peek().type}`, this.peek().pos);
  }

  match(type: Token['type']): boolean {
    if (this.check(type)) {
      this.index++;
      return true;
    }
    return false;
  }

  check(type: Token['type']): boolean {
    return this.peek().type === type;
  }

  advance(): Token {
    if (!this.check('eof')) {
      this.index++;
    }
    return this.previous();
  }

  peek(): Token {
    const current = this.tokens.at(this.index);
    if (current !== undefined) {
      return current;
    }
    const last = this.tokens.at(-1);
    if (last === undefined) {
      throw new Error('never reached');
    }
    return last;
  }

  previous(): Token {
    return this.tokens[this.index - 1];
  }

  previousAfterAdvance(): string {
    const tok = this.advance();
    return tok.value;
  }

  /** Lookahead without consuming; used by shape field disambiguation. */
  tokenAt(offset: number): Token | undefined {
    return this.tokens[this.index + offset];
  }
}
