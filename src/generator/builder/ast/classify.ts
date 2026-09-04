import type { TypeNode } from '../../../parser/ast.ts';

export function isMixed(node: TypeNode): boolean {
  return node.kind === 'keyword' && node.keyword === 'mixed';
}

export function isNever(node: TypeNode): boolean {
  return (
    node.kind === 'keyword' &&
    (node.keyword === 'never' || node.keyword === 'noreturn')
  );
}
