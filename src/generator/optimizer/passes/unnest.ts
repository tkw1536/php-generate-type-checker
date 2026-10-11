import type { Block, Stmt } from '../../ir/types.ts';
import { andExpr } from '../../ir/index.ts';
import type { OptimizeContext } from '../context.ts';
import type { BlockPass, BlockPassResult } from '../pass.ts';
import { commitReason, withScope } from '../trace/commit.ts';
import { blockStep } from '../trace/rewrite.ts';
import type { TracePos } from '../trace/types.ts';

/** `if (a) { if (b) { ... } }` → `if (a && b) { ... }` (repeated while applicable). */
export function unnest(
  block: Block,
  ctx?: Readonly<OptimizeContext>,
  pos?: TracePos,
): BlockPassResult {
  let currentPos = pos ?? { checker: block, scope: block };
  const out: Stmt[] = [];
  for (const stmt of block) {
    const next = unnestStmt(stmt, ctx, currentPos);
    out.push(next.stmt);
    currentPos = next.pos;
  }
  return { block: out, pos: currentPos };
}

function unnestStmt(
  stmt: Stmt,
  ctx: Readonly<OptimizeContext> | undefined,
  pos: TracePos,
): { readonly stmt: Stmt; readonly pos: TracePos } {
  switch (stmt.kind) {
    case 'if': {
      const original = stmt;
      const conds = [stmt.cond];
      let body: Block = stmt.body;
      let collapsed = false;
      while (body.length === 1 && body[0].kind === 'if') {
        const inner = body[0];
        conds.push(inner.cond);
        body = inner.body;
        collapsed = true;
      }
      const cond = conds.length === 1 ? conds[0] : andExpr(conds);
      const nested = unnest(body, ctx, withScope(pos, body));
      const next: Stmt = {
        kind: 'if',
        cond,
        body: nested.block,
      };
      let currentPos = nested.pos;
      if (collapsed && ctx !== undefined) {
        currentPos = commitReason(
          ctx,
          currentPos,
          blockStep('unnest.collapse', [original], [next]),
        );
      }
      return { stmt: next, pos: currentPos };
    }
    case 'foreach': {
      const nested = unnest(stmt.body, ctx, withScope(pos, stmt.body));
      return {
        stmt: { ...stmt, body: nested.block },
        pos: nested.pos,
      };
    }
    case 'return':
      return { stmt, pos };
    default:
      throw new Error('never reached');
  }
}

export const unnestPass: BlockPass = {
  id: 'unnest',
  run(block, ctx, pos) {
    return unnest(block, ctx, pos);
  },
};
