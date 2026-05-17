import type { TypeNode } from '../../parser/ast.ts';
import type { Expr, ValueRef } from '../ir/types.ts';
import { andExpr } from '../ir/index.ts';
import { exprForType } from './leafIr.ts';

/** One or more positive atoms (for consecutive failIf). */
export function exprAtomsForType(node: TypeNode, subject: ValueRef): Expr[] {
  const single = exprForType(node, subject);
  if (single !== null) {
    if (single.kind === 'and') {
      return single.exprs;
    }
    return [single];
  }

  if (node.kind === 'keyword' && node.keyword === 'mixed') {
    return [];
  }

  return [];
}

/** Whether type collapses to a single return expression. */
export function singleExprForType(node: TypeNode, subject: ValueRef): Expr | null {
  const atoms = exprAtomsForType(node, subject);
  if (atoms.length === 1) {
    return atoms[0]!;
  }
  if (atoms.length > 1) {
    return andExpr(atoms);
  }
  return exprForType(node, subject);
}
