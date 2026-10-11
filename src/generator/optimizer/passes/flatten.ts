import type { Block } from '../../ir/types.ts';
import { andExpr, notExpr, orExpr, returnStmt } from '../../ir/index.ts';
import type { OptimizeContext } from '../context.ts';
import type { BlockPass } from '../pass.ts';

/** `if (a) { return b; } return c;` at block end → `return (a && b) || (!a && c)`. */
export function flatten(block: Block, ctx?: Readonly<OptimizeContext>): Block {
  if (block.length < 2) {
    return block;
  }
  const last = block.at(-1);
  const prev = block.at(-2);
  if (
    last === undefined ||
    prev === undefined ||
    last.kind !== 'return' ||
    prev.kind !== 'if' ||
    prev.body.length !== 1
  ) {
    return block;
  }
  const inner = prev.body[0];
  if (inner.kind !== 'return') {
    return block;
  }
  const a = prev.cond;
  const b = inner.expr;
  const c = last.expr;
  const next: Block = [
    ...block.slice(0, -2),
    returnStmt(orExpr([andExpr([a, b]), andExpr([notExpr(a), c])])),
  ];
  ctx?.trace.recordBlock('flatten.fold', block, next);
  return next;
}

export const flattenPass: BlockPass = {
  id: 'flatten',
  run(block, ctx) {
    return flatten(block, ctx);
  },
};
