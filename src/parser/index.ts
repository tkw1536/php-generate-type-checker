import type { TypeNode } from './ast.ts';
import { LexerError, tokenize } from './lexer.ts';
import { ParseError } from './parseError.ts';
import { parseCallable } from './parseCallable.ts';
import { identifierToNode, parseGeneric } from './parseGeneric.ts';
import {
  parseArrayShape,
  parseListShape,
  parseObjectShape,
} from './parseShapes.ts';
import { TokenCursor } from './tokenCursor.ts';

export type TypeSegment = {
  readonly ast: TypeNode;
  readonly start: number;
  readonly end: number;
};

export type ParseTypesResult = {
  readonly source: string;
  readonly segments: readonly TypeSegment[];
};

class Parser extends TokenCursor {
  parse(): TypeNode {
    const type = this.parseOne();
    if (!this.check('eof')) {
      throw new ParseError(
        `Unexpected token "${this.peek().value}"`,
        this.peek().pos,
      );
    }
    return type;
  }

  parseOne(): TypeNode {
    return this.parseUnion();
  }

  atEof(): boolean {
    return this.check('eof');
  }

  segmentStartPos(): number {
    return this.peek().pos;
  }

  segmentEndPos(sourceLength: number): number {
    if (this.check('eof')) {
      return sourceLength;
    }
    return this.peek().pos;
  }

  parseUnion(): TypeNode {
    let left = this.parseIntersection();
    while (this.match('pipe')) {
      const right = this.parseIntersection();
      left = this.mergeUnion(left, right);
    }
    return left;
  }

  private parseIntersection(): TypeNode {
    let left = this.parsePostfix();
    while (this.match('amp')) {
      const right = this.parsePostfix();
      left = this.mergeIntersection(left, right);
    }
    return left;
  }

  parsePostfix(): TypeNode {
    const nullable = this.match('question');
    let node = this.parsePrimary();
    while (this.match('lbracket')) {
      if (!this.match('rbracket')) {
        throw new ParseError('Expected ] after [', this.peek().pos);
      }
      node = { kind: 'array', value: node };
    }
    if (nullable) {
      return this.mergeUnion(node, { kind: 'keyword', keyword: 'null' });
    }
    return node;
  }

  private parsePrimary(): TypeNode {
    if (this.match('lparen')) {
      const inner = this.parseUnion();
      if (!this.match('rparen')) {
        throw new ParseError('Expected )', this.peek().pos);
      }
      return inner;
    }

    if (this.match('number')) {
      const prev = this.previous();
      return { kind: 'literal', type: 'number', value: prev.value };
    }

    if (this.match('string')) {
      return this.parseStringLiteral();
    }

    if (!this.check('identifier')) {
      throw new ParseError(
        `Expected type, got "${this.peek().value || 'end of input'}"`,
        this.peek().pos,
      );
    }

    return this.parseIdentifierPrimary();
  }

  private parseStringLiteral(): TypeNode {
    const prev = this.previous();
    if (prev.quotes === undefined) {
      throw new ParseError('Internal error: string token missing quotes', prev.pos);
    }
    return {
      kind: 'literal',
      type: 'string',
      value: prev.value,
      quotes: prev.quotes,
    };
  }

  private parseIdentifierPrimary(): TypeNode {
    const name = this.previousAfterAdvance();

    if (name === 'array' && this.check('lbrace')) {
      return parseArrayShape(this);
    }
    if (name === 'object' && this.check('lbrace')) {
      return parseObjectShape(this);
    }
    if (name === 'list' && this.check('lbrace')) {
      return parseListShape(this);
    }
    if (name === 'callable' && this.check('lparen')) {
      return parseCallable(this);
    }
    if (this.check('lt')) {
      return parseGeneric(this, name);
    }
    return identifierToNode(name, this.previous().pos);
  }

  mergeUnion(left: TypeNode, right: TypeNode): TypeNode {
    const types = [
      ...(left.kind === 'union' ? left.types : [left]),
      ...(right.kind === 'union' ? right.types : [right]),
    ];
    return { kind: 'union', types };
  }

  mergeIntersection(left: TypeNode, right: TypeNode): TypeNode {
    const types = [
      ...(left.kind === 'intersection' ? left.types : [left]),
      ...(right.kind === 'intersection' ? right.types : [right]),
    ];
    return { kind: 'intersection', types };
  }
}

export function parseType(input: string): TypeNode {
  const trimmed = input.trim();
  if (trimmed === '') {
    throw new ParseError('Empty type string', 0);
  }
  const tokens = tokenize(trimmed);
  return new Parser(tokens).parse();
}

/** Parse one or more type expressions from sequential input (no delimiter required). */
export function parseTypes(input: string): ParseTypesResult {
  const source = input.trim();
  if (source === '') {
    throw new ParseError('Empty type string', 0);
  }
  const tokens = tokenize(source);
  const parser = new Parser(tokens);
  const segments: TypeSegment[] = [];
  let expressionIndex = 0;

  while (!parser.atEof()) {
    try {
      const start = parser.segmentStartPos();
      const ast = parser.parseOne();
      const end = parser.segmentEndPos(source.length);
      segments.push({ ast, start, end });
      expressionIndex++;
    } catch (err) {
      if (err instanceof ParseError) {
        throw new ParseError(err.message, err.pos, expressionIndex);
      }
      if (err instanceof LexerError) {
        throw new ParseError(err.message, err.pos, expressionIndex);
      }
      throw err;
    }
  }

  return { source, segments };
}
