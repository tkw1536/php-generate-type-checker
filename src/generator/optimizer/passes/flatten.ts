import type { Block } from '../../ir/types.ts';
import { andExpr, notExpr, orExpr, returnStmt } from '../../ir/index.ts';
import type { OptimizeContext } from '../context.ts';
import type { BlockPass, BlockPassResult } from '../pass.ts';
import { commitReason } from '../trace/commit.ts';
import { blockStep } from '../trace/rewrite.ts';
import type { TracePos } from '../trace/types.ts';

/** `if (a) { return b; } return c;` at block end → `return (a && b) || (!a && c)`. */
export function flatten(
  block: Block,
  ctx?: Readonly<OptimizeContext>,
  pos?: TracePos,
): BlockPassResult {
  let currentPos = pos ?? { checker: block, scope: block };
  if (block.length < 2) {
    return { block, pos: currentPos };
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
    return { block, pos: currentPos };
  }
  const inner = prev.body[0];
  if (inner.kind !== 'return') {
    return { block, pos: currentPos };
  }
  const a = prev.cond;
  const b = inner.expr;
  const c = last.expr;
  const next: Block = [
    ...block.slice(0, -2),
    returnStmt(orExpr([andExpr([a, b]), andExpr([notExpr(a), c])])),
  ];
  if (ctx !== undefined) {
    currentPos = commitReason(
      ctx,
      currentPos,
      blockStep('flatten.fold', block, next),
    );
  }
  return { block: next, pos: currentPos };
}

export const flattenPass: BlockPass = {
  id: 'flatten',
  run(block, ctx, pos) {
    return flatten(block, ctx, pos);
  },
};
