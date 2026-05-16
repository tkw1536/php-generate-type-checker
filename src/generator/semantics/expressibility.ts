import type { TypeNode } from '../../parser/ast.ts';
import { normalizeNode } from './normalize.ts';
import { isSupportedLeafType } from './leaves.ts';

export function isNoOpValueCheck(node: TypeNode): boolean {
  return node.kind === 'primitive' && node.name === 'mixed';
}

export function isNeverPrimitive(node: TypeNode): boolean {
  if (node.kind !== 'primitive') {
    return false;
  }
  switch (node.name) {
    case 'never':
    case 'noreturn':
    case 'never-return':
    case 'never-returns':
    case 'no-return':
      return true;
    default:
      return false;
  }
}

export function isExpressible(node: TypeNode): boolean {
  if (isNoOpValueCheck(node)) {
    return true;
  }
  if (
    node.kind === 'literal' ||
    node.kind === 'class' ||
    node.kind === 'primitive' ||
    node.kind === 'int_range'
  ) {
    return isSupportedLeafType(node);
  }
  if (node.kind === 'union') {
    return node.types.every(isExpressible);
  }
  if (node.kind === 'intersection') {
    return node.types.every(isExpressible);
  }
  return false;
}

/** True when validating this type requires statements (not a single boolean expression check). */
export function needsStatementBlock(node: TypeNode): boolean {
  const n = normalizeNode(node);
  switch (n.kind) {
    case 'array':
      return true;
    case 'list':
      return !isNoOpValueCheck(n.element);
    case 'shape':
      return true;
    case 'union':
      return n.types.some(needsStatementBlock);
    case 'intersection':
      return n.types.some(needsStatementBlock);
    default:
      return false;
  }
}
