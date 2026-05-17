import type { TypeNode } from '../../parser/ast.ts';

const SUPPORTED_LEAF_KEYWORDS = new Set([
  'int',
  'integer',
  'string',
  'float',
  'double',
  'number',
  'numeric',
  'bool',
  'boolean',
  'scalar',
  'null',
  'array',
  'iterable',
  'object',
  'resource',
  'never',
  'noreturn',
  'true',
  'false',
  'callable',
  'array-key',
  'positive-int',
  'negative-int',
  'non-positive-int',
  'non-negative-int',
  'non-zero-int',
  'non-empty-string',
  'non-falsy-string',
  'truthy-string',
  'non-empty-mixed',
  'empty',
  'class-string',
  'interface-string',
  'trait-string',
  'enum-string',
  'numeric-string',
  'callable-string',
  'lowercase-string',
  'uppercase-string',
  'decimal-int-string',
  'non-decimal-int-string',
  'non-empty-lowercase-string',
  'non-empty-uppercase-string',
]);

/** Whether a keyword has a direct single-expression leaf guard. */
function leafPrimitiveSupported(keyword: string): boolean {
  return SUPPORTED_LEAF_KEYWORDS.has(keyword);
}

/** Whether a leaf {@link TypeNode} has a direct single-expression IR guard. */
export function isSupportedLeafType(node: TypeNode): boolean {
  switch (node.kind) {
    case 'literal':
      return node.type === 'string' || node.type === 'number';
    case 'class':
    case 'range':
      return true;
    case 'keyword':
      return leafPrimitiveSupported(node.keyword);
    default:
      return false;
  }
}
