import type { TypeNode } from '../../parser/ast.ts';
import { variableRef } from '../ir/index.ts';
import { exprForType } from '../builder/leafIr.ts';
import { normalizeNode } from './normalize.ts';

/** Whether a leaf {@link TypeNode} has a direct single-expression IR guard. */
export function isSupportedLeafType(node: TypeNode): boolean {
  const n = normalizeNode(node);
  if (
    n.kind === 'literal' ||
    n.kind === 'class' ||
    n.kind === 'primitive' ||
    n.kind === 'int_range'
  ) {
    return exprForType(n, variableRef('$_')) !== null;
  }
  return false;
}
