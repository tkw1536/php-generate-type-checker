/**
 * Union member ordering shared by emit and type slugs so OR / naming stay consistent.
 */
import type { TypeNode } from '../parser/ast.ts';
import { typeDedupeKey } from './typeKey.ts';
import { isExpressible, needsStatementBlock } from './simpleTypes.ts';

export function flattenUnion(node: TypeNode): TypeNode[] {
  if (node.kind === 'union') {
    return node.types.flatMap(flattenUnion);
  }
  return [node];
}

function unionSortKey(node: TypeNode): number {
  if (node.kind === 'primitive' && node.name === 'null') {
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

/** Flatten then sort the same way as {@link emitRootUnionDisjunctive}. */
export function sortFlattenedUnionMembers(node: TypeNode): TypeNode[] {
  return sortUnionMembers(flattenUnion(node));
}
