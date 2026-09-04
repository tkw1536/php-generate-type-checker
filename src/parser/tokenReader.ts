import type { Token } from './lexer.ts';

/** Readonly token-navigation API used by shape/callable/generic parsers. */
export type TokenReader = {
  readonly expect: (type: Token['type']) => Token;
  readonly match: (type: Token['type']) => boolean;
  readonly check: (type: Token['type']) => boolean;
  readonly advance: () => Token;
  readonly peek: () => Token;
  readonly previous: () => Token;
  readonly previousAfterAdvance: () => string;
  readonly tokenAt: (offset: number) => Token | undefined;
};
