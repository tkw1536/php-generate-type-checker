import type { ShapeField, TypeNode } from './ast.ts';
import { ParseError } from './parseError.ts';
import type { TokenReader } from './tokenReader.ts';

/** Host methods required to parse array/object/list shapes. */
export type ShapeParseHost = TokenReader & {
  readonly parseUnion: () => TypeNode;
};

export function parseArrayShape(host: ShapeParseHost): TypeNode {
  host.expect('lbrace');
  const node = parseArrayShapeBody(host);
  host.expect('rbrace');
  return node;
}

function parseArrayShapeBody(host: ShapeParseHost): TypeNode {
  if (host.check('rbrace')) {
    return { kind: 'shape', fields: [], keyword: 'array' };
  }
  const fields = parseMixedShapeFields(host);
  return { kind: 'shape', fields, keyword: 'array' };
}

export function parseObjectShape(host: ShapeParseHost): TypeNode {
  host.expect('lbrace');
  const fields = parseShapeFields(host);
  host.expect('rbrace');
  return { kind: 'shape', fields, keyword: 'object' };
}

export function parseListShape(host: ShapeParseHost): TypeNode {
  host.expect('lbrace');
  const fields = host.check('rbrace') ? [] : parseMixedShapeFields(host);
  host.expect('rbrace');
  return { kind: 'shape', fields, keyword: 'list' };
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
    const field = parseShapeField(host);
    fields.push(field);
  } while (host.match('comma') && !host.check('rbrace'));

  return fields;
}

/** Positional (`key: null`) and keyed (`key: string|number`) fields in one `array{…}` / `list{…}` body. */
function parseMixedShapeFields(host: ShapeParseHost): ShapeField[] {
  const fields: ShapeField[] = [];
  do {
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
  return fields;
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
