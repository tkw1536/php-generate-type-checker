import type { Block } from '../ir/types.ts';
import { andExpr, notExpr, orExpr, returnStmt } from '../ir/index.ts';

/** `if (a) { return b; } return c;` at block end → `return (a && b) || (!a && c)`. */
export function flatten(block: Block): Block {
  if (block.length < 2) {
    return block;
  }
  const last = block[block.length - 1]!;
  const prev = block[block.length - 2]!;
  if (last.kind !== 'return' || prev.kind !== 'if' || prev.body.length !== 1) {
    return block;
  }
  const inner = prev.body[0]!;
  if (inner.kind !== 'return') {
    return block;
  }
  const a = prev.cond;
  const b = inner.expr;
  const c = last.expr;
  return [
    ...block.slice(0, -2),
    returnStmt(
      orExpr([andExpr([a, b]), andExpr([notExpr(a), c])]),
    ),
  ];
}
