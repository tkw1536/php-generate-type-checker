import type { ShapeField, ShapeRest, TypeNode } from '../parser/ast.ts';

/** PHPStan detect-mode key type for written `string` array keys. */
const DETECT_STRING_KEY: TypeNode = {
  kind: 'union',
  types: [
    { kind: 'keyword', keyword: 'int' },
    { kind: 'keyword', keyword: 'non-decimal-int-string' },
  ],
};

/**
 * Rewrite `array` / `non-empty-array` keys that are exactly `string` to
 * `int|non-decimal-int-string` (PHPStan `reportUnsafeArrayStringKeyCasting: detect`).
 * Lists, value-only arrays, shape rests, and other key types are unchanged.
 */
export function allowUnsafeArrayStringKeysInType(node: TypeNode): TypeNode {
  switch (node.kind) {
    case 'keyword':
    case 'named':
    case 'literal':
    case 'range':
    case 'unsupported':
    case 'callable':
      return node;
    case 'array':
      return {
        kind: 'array',
        value: allowUnsafeArrayStringKeysInType(node.value),
      };
    case 'union':
      return {
        kind: 'union',
        types: node.types.map(allowUnsafeArrayStringKeysInType),
      };
    case 'intersection':
      return {
        kind: 'intersection',
        types: node.types.map(allowUnsafeArrayStringKeysInType),
      };
    case 'collection':
      return rewriteCollection(node);
    case 'shape':
      return rewriteShape(node);
    case 'generic':
      return {
        kind: 'generic',
        name: node.name,
        typeArgs: node.typeArgs.map(allowUnsafeArrayStringKeysInType),
      };
    default:
      throw new Error('never reached');
  }
}

function isExactStringKeyword(node: TypeNode): boolean {
  return node.kind === 'keyword' && node.keyword === 'string';
}

function isArrayCollectionKeyword(
  keyword: Extract<TypeNode, { kind: 'collection' }>['keyword'],
): boolean {
  return keyword === 'array' || keyword === 'non-empty-array';
}

function rewriteCollection(
  node: Extract<TypeNode, { kind: 'collection' }>,
): TypeNode {
  if ('key' in node) {
    const key =
      isArrayCollectionKeyword(node.keyword) && isExactStringKeyword(node.key)
        ? DETECT_STRING_KEY
        : allowUnsafeArrayStringKeysInType(node.key);
    return {
      kind: 'collection',
      keyword: node.keyword,
      key,
      value: allowUnsafeArrayStringKeysInType(node.value),
    };
  }
  return {
    kind: 'collection',
    keyword: node.keyword,
    value: allowUnsafeArrayStringKeysInType(node.value),
  };
}

function rewriteShape(node: Extract<TypeNode, { kind: 'shape' }>): TypeNode {
  const fields = node.fields.map(rewriteShapeField);
  if (node.rest === undefined) {
    return { kind: 'shape', keyword: node.keyword, fields };
  }
  return {
    kind: 'shape',
    keyword: node.keyword,
    fields,
    rest: rewriteShapeRest(node.rest),
  };
}

function rewriteShapeField(field: ShapeField): ShapeField {
  return {
    ...field,
    value: allowUnsafeArrayStringKeysInType(field.value),
  };
}

function rewriteShapeRest(rest: ShapeRest): ShapeRest {
  switch (rest.kind) {
    case 'any':
      return rest;
    case 'values':
      return {
        kind: 'values',
        value: allowUnsafeArrayStringKeysInType(rest.value),
      };
    case 'entries':
      // Do not rewrite rest keys; only recurse into nested value/key types.
      return {
        kind: 'entries',
        key: allowUnsafeArrayStringKeysInType(rest.key),
        value: allowUnsafeArrayStringKeysInType(rest.value),
      };
    default:
      throw new Error('never reached');
  }
}
