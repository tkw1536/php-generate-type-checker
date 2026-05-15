import type { CallableParam, CallableSig, ShapeField, TypeNode } from './ast.ts';
import { isPrimitiveName } from './ast.ts';
import { type Token, tokenize } from './lexer.ts';

export class ParseError extends Error {
  readonly pos: number;

  constructor(message: string, pos: number) {
    super(message);
    this.name = 'ParseError';
    this.pos = pos;
  }
}

class Parser {
  private index = 0;
  private readonly tokens: Token[];

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  parse(): TypeNode {
    const type = this.parseUnion();
    if (!this.check('eof')) {
      throw new ParseError(
        `Unexpected token "${this.peek().value}"`,
        this.peek().pos,
      );
    }
    return type;
  }

  private parseUnion(): TypeNode {
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

  private parsePostfix(): TypeNode {
    let node = this.parsePrimary();
    while (this.match('lbracket')) {
      if (!this.match('rbracket')) {
        throw new ParseError('Expected ] after [', this.peek().pos);
      }
      node = { kind: 'array', value: node };
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
      const num = prev.value.includes('.')
        ? parseFloat(prev.value)
        : parseInt(prev.value, 10);
      return { kind: 'literal', value: num };
    }

    if (this.match('string')) {
      return { kind: 'literal', value: this.previous().value };
    }

    if (!this.check('identifier')) {
      throw new ParseError(
        `Expected type, got "${this.peek().value || 'end of input'}"`,
        this.peek().pos,
      );
    }

    const name = this.previousAfterAdvance();

    if (name === 'array' && this.check('lbrace')) {
      return this.parseArrayShape();
    }

    if (name === 'list' && this.check('lbrace')) {
      return this.parseListShape();
    }

    if (name === 'callable' && this.check('lparen')) {
      return this.parseCallable();
    }

    if (this.check('lt')) {
      return this.parseGeneric(name);
    }

    return this.identifierToNode(name);
  }

  private parseArrayShape(): TypeNode {
    this.expect('lbrace');
    const fields = this.parseShapeFields();
    this.expect('rbrace');
    return { kind: 'shape', fields };
  }

  private parseListShape(): TypeNode {
    this.expect('lbrace');
    const elements: TypeNode[] = [];
    if (!this.check('rbrace')) {
      do {
        elements.push(this.parseUnion());
      } while (this.match('comma') && !this.check('rbrace'));
    }
    this.expect('rbrace');
    if (elements.length === 1) {
      return { kind: 'list', element: elements[0] };
    }
    const fields: ShapeField[] = elements.map((type, index) => ({
      key: index,
      type,
    }));
    return { kind: 'shape', fields };
  }

  private parseShapeFields(): ShapeField[] {
    const fields: ShapeField[] = [];
    if (this.check('rbrace')) {
      return fields;
    }

    do {
      const field = this.parseShapeField();
      fields.push(field);
    } while (this.match('comma') && !this.check('rbrace'));

    return fields;
  }

  private parseShapeField(): ShapeField {
    let key: string | number;
    let optional = false;

    if (this.check('number')) {
      key = parseInt(this.advance().value, 10);
    } else if (this.check('string')) {
      key = this.advance().value;
    } else if (this.check('identifier')) {
      const ident = this.advance().value;
      if (ident.includes('::')) {
        key = ident;
      } else {
        key = ident;
      }
    } else {
      throw new ParseError('Expected shape field key', this.peek().pos);
    }

    if (this.match('question')) {
      optional = true;
    }

    this.expect('colon');
    const type = this.parseUnion();
    return optional ? { key, optional: true, type } : { key, type };
  }

  private parseCallable(): TypeNode {
    this.expect('lparen');
    const params: CallableParam[] = [];

    if (!this.check('rparen')) {
      do {
        params.push(this.parseCallableParam());
      } while (this.match('comma') && !this.check('rparen'));
    }

    this.expect('rparen');
    this.expect('colon');
    const returnType = this.parseUnion();

    const signature: CallableSig = { params, returnType };
    return { kind: 'callable', signature };
  }

  private isParamByRefAmp(): boolean {
    if (!this.check('amp')) {
      return false;
    }
    const next = this.tokens[this.index + 1];
    return next?.type === 'identifier' && next.value.startsWith('$');
  }

  private parseCallableParamIntersection(): TypeNode {
    let left = this.parsePostfix();
    while (this.check('amp') && !this.isParamByRefAmp()) {
      this.advance();
      const right = this.parsePostfix();
      left = this.mergeIntersection(left, right);
    }
    return left;
  }

  private parseCallableParamType(): TypeNode {
    let left = this.parseCallableParamIntersection();
    while (this.match('pipe')) {
      const right = this.parseCallableParamIntersection();
      left = this.mergeUnion(left, right);
    }
    return left;
  }

  private parseCallableParam(): CallableParam {
    let variadic = false;
    if (this.match('ellipsis')) {
      variadic = true;
    }

    const type = this.parseCallableParamType();
    let name: string | undefined;
    let byRef = false;
    let optional = false;

    if (!variadic && this.match('ellipsis')) {
      variadic = true;
    }

    if (this.match('amp')) {
      byRef = true;
      if (this.check('identifier')) {
        name = this.advance().value;
      }
    } else if (this.check('identifier')) {
      name = this.advance().value;
    }

    if (this.match('equals') || this.match('question')) {
      optional = true;
    }

    return { type, name, byRef, optional, variadic };
  }

  private parseGeneric(name: string): TypeNode {
    this.expect('lt');
    const typeArgs: TypeNode[] = [];

    if (!this.check('gt')) {
      do {
        typeArgs.push(this.parseUnion());
      } while (this.match('comma') && !this.check('gt'));
    }

    this.expect('gt');

    if (name === 'array') {
      return this.genericArrayToNode(typeArgs);
    }
    if (name === 'list') {
      if (typeArgs.length !== 1) {
        return {
          kind: 'unsupported',
          raw: `list<${typeArgs.length} args>`,
          reason: 'list expects one type argument',
        };
      }
      return { kind: 'list', element: typeArgs[0] };
    }
    if (name === 'non-empty-list' && typeArgs.length === 1) {
      return { kind: 'list', element: typeArgs[0] };
    }

    return { kind: 'generic', name, typeArgs };
  }

  private genericArrayToNode(typeArgs: TypeNode[]): TypeNode {
    if (typeArgs.length === 1) {
      return { kind: 'array', value: typeArgs[0] };
    }
    if (typeArgs.length === 2) {
      return { kind: 'array', key: typeArgs[0], value: typeArgs[1] };
    }
    return {
      kind: 'unsupported',
      raw: `array<${typeArgs.length} args>`,
      reason: 'array expects one or two type arguments',
    };
  }

  private identifierToNode(name: string): TypeNode {
    if (name === 'true' || name === 'false') {
      return { kind: 'literal', value: name === 'true' };
    }
    if (name === 'null') {
      return { kind: 'primitive', name: 'null' };
    }
    if (isPrimitiveName(name)) {
      return { kind: 'primitive', name };
    }
    if (name.startsWith('\\') || name.includes('\\')) {
      return { kind: 'class', name };
    }
    return { kind: 'class', name };
  }

  private mergeUnion(left: TypeNode, right: TypeNode): TypeNode {
    const types = [
      ...(left.kind === 'union' ? left.types : [left]),
      ...(right.kind === 'union' ? right.types : [right]),
    ];
    return { kind: 'union', types };
  }

  private mergeIntersection(left: TypeNode, right: TypeNode): TypeNode {
    const types = [
      ...(left.kind === 'intersection' ? left.types : [left]),
      ...(right.kind === 'intersection' ? right.types : [right]),
    ];
    return { kind: 'intersection', types };
  }

  private expect(type: Token['type']): Token {
    if (this.match(type)) {
      return this.previous();
    }
    throw new ParseError(`Expected ${type}, got ${this.peek().type}`, this.peek().pos);
  }

  private match(type: Token['type']): boolean {
    if (this.check(type)) {
      this.index++;
      return true;
    }
    return false;
  }

  private check(type: Token['type']): boolean {
    return this.peek().type === type;
  }

  private advance(): Token {
    if (!this.check('eof')) {
      this.index++;
    }
    return this.previous();
  }

  private peek(): Token {
    return this.tokens[this.index] ?? this.tokens[this.tokens.length - 1];
  }

  private previous(): Token {
    return this.tokens[this.index - 1];
  }

  private previousAfterAdvance(): string {
    const tok = this.advance();
    return tok.value;
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
