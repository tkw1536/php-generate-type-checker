import { GenerationError } from './generator/errors.ts';
import { TypeAliasResolveError } from './parser/aliasGraph.ts';
import { LexerError } from './parser/lexer.ts';
import { ParseError } from './parser/parseError.ts';
import { PhpstanTypeExtractError } from './parser/phpstanTypeDocblock.ts';

/** Normalized error for UI HTML and CLI text rendering. */
export interface PositionedError {
  readonly kind: 'parse' | 'lexer' | 'generation' | 'unknown';
  readonly title: string;
  readonly message: string;
  readonly pos?: number;
  readonly detail?: string;
  readonly expressionIndex?: number;
  readonly segmentSource?: string;
}

/** Map thrown errors to a positioned description (same data for UI and CLI). */
export function describeError(err: unknown): PositionedError {
  if (err instanceof ParseError) {
    return {
      kind: 'parse',
      title: 'Parse error',
      message: err.message,
      pos: err.pos,
      expressionIndex: err.expressionIndex,
    };
  }
  if (err instanceof PhpstanTypeExtractError) {
    return {
      kind: 'parse',
      title: 'Invalid input',
      message: err.message,
      pos: err.pos,
    };
  }
  if (err instanceof TypeAliasResolveError) {
    return {
      kind: 'parse',
      title: 'Invalid type alias',
      message: err.message,
      detail: err.aliasName,
      pos: err.pos,
    };
  }
  return describeNonParseError(err);
}

function describeNonParseError(err: unknown): PositionedError {
  if (err instanceof LexerError) {
    return {
      kind: 'lexer',
      title: 'Lexer error',
      message: err.message,
      pos: err.pos,
    };
  }
  if (err instanceof GenerationError) {
    return {
      kind: 'generation',
      title: 'Generation error',
      message: err.message,
      detail: err.typeDescription,
      expressionIndex: err.expressionIndex,
      segmentSource: err.segmentSource,
    };
  }
  if (err instanceof Error) {
    return { kind: 'unknown', title: 'Error', message: err.message };
  }
  return { kind: 'unknown', title: 'Error', message: String(err) };
}

/** Convert a 0-based source offset to 1-based line/column. */
export function posToLineCol(
  source: string,
  pos: number,
): { line: number; col: number } {
  let line = 1;
  let col = 1;
  for (let i = 0; i < pos && i < source.length; i++) {
    if (source[i] === '\n') {
      line++;
      col = 1;
    } else {
      col++;
    }
  }
  return { line, col };
}
