import type { Block, Stmt } from '../../ir/types.ts';
import { andExpr } from '../../ir/index.ts';
import type { OptimizeContext } from '../context.ts';
import type { BlockPass } from '../pass.ts';

/** `if (a) { if (b) { ... } }` → `if (a && b) { ... }` (repeated while applicable). */
export function unnest(block: Block, ctx?: Readonly<OptimizeContext>): Block {
  return block.map((stmt) => unnestStmt(stmt, ctx));
}

function unnestStmt(stmt: Stmt, ctx?: Readonly<OptimizeContext>): Stmt {
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
      const next: Stmt = {
        kind: 'if',
        cond,
        body: unnest(body, ctx),
      };
      if (collapsed) {
        ctx?.trace.recordBlock('unnest.collapse', [original], [next]);
      }
      return next;
    }
    case 'foreach':
      return { ...stmt, body: unnest(stmt.body, ctx) };
    case 'return':
      return stmt;
    default:
      throw new Error('never reached');
  }
}

export const unnestPass: BlockPass = {
  id: 'unnest',
  run(block, ctx) {
    return unnest(block, ctx);
  },
};
