import type { TypeNode } from '../../../parser/ast.ts';

export function isMixed(node: TypeNode): boolean {
  return node.kind === 'keyword' && node.keyword === 'mixed';
}

export function isNever(node: TypeNode): boolean {
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

