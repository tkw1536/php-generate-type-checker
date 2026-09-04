import type { TypeNode } from './ast.ts';
import { isKeyword } from './ast.ts';
import { ParseError } from './parseError.ts';
import { isAllowedNamedType } from './phpClassName.ts';
import type { TokenReader } from './tokenReader.ts';

/** Host methods required to parse generics and int ranges. */
export type GenericParseHost = TokenReader & {
  readonly parseUnion: () => TypeNode;
};

export function parseGeneric(host: GenericParseHost, name: string): TypeNode {
  host.expect('lt');

  if (name === 'int' || name === 'integer') {
    const node = parseIntRangeGenericBody(host, name);
    host.expect('gt');
    return node;
  }

  const typeArgs: TypeNode[] = [];

  if (!host.check('gt')) {
    do {
      typeArgs.push(host.parseUnion());
    } while (host.match('comma') && !host.check('gt'));
  }

  host.expect('gt');

  if (
    name === 'array' ||
    name === 'non-empty-array' ||
    name === 'iterable' ||
    name === 'non-empty-iterable' ||
    name === 'list' ||
    name === 'non-empty-list'
  ) {
    return genericCollectionToNode(typeArgs, name);
  }

  return { kind: 'generic', name, typeArgs };
}

/** `int<lower, upper>` / `integer<…>`: bounds are integer literals or `min` / `max` for open sides. */
function parseIntRangeGenericBody(
  host: GenericParseHost,
  keyword: 'int' | 'integer',
): TypeNode {
  const lo = parseIntRangeEndpoint(host, 'lower');
  host.expect('comma');
  const hi = parseIntRangeEndpoint(host, 'upper');
  const min = lo.kind === 'open' ? null : lo.value;
  const max = hi.kind === 'open' ? null : hi.value;
  if (min !== null && max !== null && min > max) {
    throw new ParseError(`Invalid int range: ${min} > ${max}`, host.peek().pos);
  }
  return { kind: 'range', min, max, keyword };
}

function parseIntRangeEndpoint(
  host: GenericParseHost,
  side: 'lower' | 'upper',
): { kind: 'open' } | { kind: 'value'; value: number } {
  if (host.match('number')) {
    const prev = host.previous();
    const num = prev.value.includes('.')
      ? Number(prev.value)
      : Math.trunc(Number(prev.value));
    if (!Number.isInteger(num)) {
      throw new ParseError('int range bounds must be integers', host.peek().pos);
    }
    return { kind: 'value', value: num };
  }
  if (!host.check('identifier')) {
    throw new ParseError('Expected integer literal or min/max', host.peek().pos);
  }
  const id = host.advance().value;
  if (side === 'lower' && id === 'min') {
    return { kind: 'open' };
  }
  if (side === 'upper' && id === 'max') {
    return { kind: 'open' };
  }
  throw new ParseError(
    `Expected ${side === 'lower' ? 'integer or min' : 'integer or max'}, got "${id}"`,
    host.peek().pos,
  );
}

function genericCollectionToNode(
  typeArgs: readonly TypeNode[],
  keyword:
    | 'list'
    | 'non-empty-list'
    | 'array'
    | 'non-empty-array'
    | 'iterable'
    | 'non-empty-iterable',
): TypeNode {
  if (typeArgs.length === 0) {
    return { kind: 'shape', fields: [], keyword };
  }
  if (typeArgs.length === 1) {
    return { kind: 'collection', value: typeArgs[0], keyword };
  }
  if (typeArgs.length === 2) {
    if (keyword === 'list' || keyword === 'non-empty-list') {
      return {
        kind: 'unsupported',
        raw: `${keyword}<${typeArgs.length} args>`,
        reason: `${keyword} expects zero or one type argument`,
      };
    }
    return {
      kind: 'collection',
      key: typeArgs[0],
      value: typeArgs[1],
      keyword,
    };
  }
  return {
    kind: 'unsupported',
    raw: `${keyword}<${typeArgs.length} args>`,
    reason: `${keyword} expects zero, one, or two type arguments`,
  };
}

export function identifierToNode(name: string, pos: number): TypeNode {
  if (name === 'null') {
    return { kind: 'keyword', keyword: 'null' };
  }
  if (isKeyword(name)) {
    return { kind: 'keyword', keyword: name };
  }
  if (!isAllowedNamedType(name)) {
    throw new ParseError(`Invalid PHP class name: "${name}"`, pos);
  }
  return { kind: 'named', name };
}
