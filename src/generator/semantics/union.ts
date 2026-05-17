/**
 * Union member ordering shared by naming and codegen so OR chains stay consistent.
 */
import type { TypeNode } from '../../parser/ast.ts';
import { typeDedupeKey } from './keys.ts';
import { isExpressible, needsStatementBlock } from './expressibility.ts';

export function flattenUnion(node: TypeNode): TypeNode[] {
  if (node.kind === 'union') {
    return node.types.flatMap(flattenUnion);
  }
  return [node];
}

function unionSortKey(node: TypeNode): number {
  if (node.kind === 'keyword' && node.keyword === 'null') {
    return 0;
  }
  if (isExpressible(node) && !needsStatementBlock(node)) {
    return 1;
  }
  return 2;
}

export function sortUnionMembers(members: TypeNode[]): TypeNode[] {
  return [...members].sort((a, b) => {
    const d = unionSortKey(a) - unionSortKey(b);
    if (d !== 0) {
      return d;
    }
    return typeDedupeKey(a).localeCompare(typeDedupeKey(b));
  });
}

export function sortFlattenedUnionMembers(node: TypeNode): TypeNode[] {
  return sortUnionMembers(flattenUnion(node));
}
