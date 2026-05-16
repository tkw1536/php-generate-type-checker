import type { TypeNode } from '../../parser/ast.ts';
import { normalizeNode } from './normalize.ts';

const SUPPORTED_LEAF_PRIMITIVES = new Set([
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
  'empty-scalar',
  'non-empty-scalar',
  'null',
  'array',
  'iterable',
  'object',
  'resource',
  'never',
  'noreturn',
  'never-return',
  'never-returns',
  'no-return',
  'true',
  'false',
  'callable',
  'callable-object',
  'callable-array',
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

/** Whether a primitive name has a direct single-expression leaf guard. */
export function leafPrimitiveSupported(name: string): boolean {
  return SUPPORTED_LEAF_PRIMITIVES.has(name);
}

/** Whether a leaf {@link TypeNode} has a direct single-expression IR guard. */
export function isSupportedLeafType(node: TypeNode): boolean {
  const n = normalizeNode(node);
  switch (n.kind) {
    case 'literal':
      return (
        typeof n.value === 'string' ||
        typeof n.value === 'number' ||
        typeof n.value === 'boolean'
      );
    case 'class':
    case 'int_range':
      return true;
    case 'primitive':
      return leafPrimitiveSupported(n.name);
    default:
      return false;
  }
}
