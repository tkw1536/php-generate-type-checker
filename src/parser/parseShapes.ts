import type { ShapeField, ShapeRest, TypeNode } from './ast.ts';
import { ParseError } from './parseError.ts';
import type { TokenReader } from './tokenReader.ts';

/** Host methods required to parse array/object/list shapes. */
export type ShapeParseHost = TokenReader & {
  readonly parseUnion: () => TypeNode;
};

type ArrayShapeKeyword = 'array' | 'non-empty-array';
type ListShapeKeyword = 'list' | 'non-empty-list';

export function parseArrayShape(
  host: ShapeParseHost,
  keyword: ArrayShapeKeyword = 'array',
): TypeNode {
  host.expect('lbrace');
  const body = host.check('rbrace')
    ? { fields: [] as ShapeField[], rest: undefined }
    : parseMixedShapeBody(host, { allowEntriesRest: true });
  host.expect('rbrace');
  return shapeNode(keyword, body.fields, body.rest);
}

export function parseObjectShape(host: ShapeParseHost): TypeNode {
  host.expect('lbrace');
  const fields = parseShapeFields(host);
  host.expect('rbrace');
  return { kind: 'shape', fields, keyword: 'object' };
}

export function parseListShape(
  host: ShapeParseHost,
  keyword: ListShapeKeyword = 'list',
): TypeNode {
  host.expect('lbrace');
  const body = host.check('rbrace')
    ? { fields: [] as ShapeField[], rest: undefined }
    : parseMixedShapeBody(host, { allowEntriesRest: false });
  host.expect('rbrace');
  return shapeNode(keyword, body.fields, body.rest);
}

function shapeNode(
  keyword: ArrayShapeKeyword | ListShapeKeyword,
  fields: readonly ShapeField[],
  rest: ShapeRest | undefined,
): TypeNode {
  if (rest === undefined) {
    return { kind: 'shape', fields, keyword };
  }
  return { kind: 'shape', fields, keyword, rest };
}

function isKeyedShapeFieldStart(host: ShapeParseHost): boolean {
  if (host.check('number') || host.check('string')) {
    return true;
  }
  if (!host.check('identifier')) {
    return false;
  }
  let offset = 1;
  if (host.tokenAt(offset)?.type === 'question') {
    offset++;
  }
  return host.tokenAt(offset)?.type === 'colon';
}

function parseShapeFields(host: ShapeParseHost): ShapeField[] {
  const fields: ShapeField[] = [];
  if (host.check('rbrace')) {
    return fields;
  }

  do {
    if (host.check('ellipsis')) {
      throw new ParseError(
        'Unsealed rest (...) is not supported on object shapes',
        host.peek().pos,
      );
    }
    const field = parseShapeField(host);
    fields.push(field);
  } while (host.match('comma') && !host.check('rbrace'));

  return fields;
}

type MixedShapeBody = {
  readonly fields: ShapeField[];
  readonly rest: ShapeRest | undefined;
};

/**
 * Positional (`key: null`) and keyed fields, plus optional trailing unsealed rest.
 */
function parseMixedShapeBody(
  host: ShapeParseHost,
  opts: { readonly allowEntriesRest: boolean },
): MixedShapeBody {
  const fields: ShapeField[] = [];
  let rest: ShapeRest | undefined;

  do {
    if (host.check('ellipsis')) {
      if (rest !== undefined) {
        throw new ParseError(
          'Shape rest (...) may only appear once',
          host.peek().pos,
        );
      }
      rest = parseShapeRest(host, opts.allowEntriesRest);
      if (host.match('comma') && !host.check('rbrace')) {
        throw new ParseError(
          'Shape rest (...) must be the last element',
          host.peek().pos,
        );
      }
      break;
    }
    if (isKeyedShapeFieldStart(host)) {
      fields.push(parseShapeField(host));
    } else {
      fields.push({
        key: null,
        optional: false,
        value: host.parseUnion(),
      });
    }
  } while (host.match('comma') && !host.check('rbrace'));

  return { fields, rest };
}

function parseShapeRest(
  host: ShapeParseHost,
  allowEntriesRest: boolean,
): ShapeRest {
  host.expect('ellipsis');
  if (!host.match('lt')) {
    return { kind: 'any' };
  }
  const first = host.parseUnion();
  if (host.match('comma')) {
    if (!allowEntriesRest) {
      throw new ParseError(
        'List shapes only allow a single value type after ... (not ...<K, V>)',
        host.peek().pos,
      );
    }
    const value = host.parseUnion();
    host.expect('gt');
    return { kind: 'entries', key: first, value };
  }
  host.expect('gt');
  return { kind: 'values', value: first };
}

function parseShapeField(host: ShapeParseHost): ShapeField {
  let key: string | number;
  let optional = false;

  if (host.check('number')) {
    key = Math.trunc(Number(host.advance().value));
  } else if (host.check('string')) {
    key = host.advance().value;
  } else if (host.check('identifier')) {
    key = host.advance().value;
  } else {
    throw new ParseError('Expected shape field key', host.peek().pos);
  }

  if (host.match('question')) {
    optional = true;
  }

  host.expect('colon');
  const type = host.parseUnion();
  return { key, optional, value: type };
}
