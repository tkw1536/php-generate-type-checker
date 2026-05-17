import type { TypeNode } from '../../parser/ast.ts';
import { isBareListKeyword } from './collection.ts';
import { isSupportedLeafType } from './leaves.ts';

export function isNoOpValueCheck(node: TypeNode): boolean {
  return node.kind === 'keyword' && node.keyword === 'mixed';
}

export function isNeverPrimitive(node: TypeNode): boolean {
  if (node.kind !== 'keyword') {
    return false;
  }
  switch (node.keyword) {
    case 'never':
    case 'noreturn':
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
    node.kind === 'keyword' ||
    node.kind === 'range'
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
  switch (node.kind) {
    case 'collection':
      return true;
    case 'shape':
      return true;
    case 'array':
      return true;
    case 'union':
      return node.types.some(needsStatementBlock);
    case 'intersection':
      return node.types.some(needsStatementBlock);
    case 'keyword':
      return isBareListKeyword(node);
    default:
      return false;
  }
}
