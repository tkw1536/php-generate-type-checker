import type { Block, Expr, Stmt } from '../../../ir/types.ts';
import { equals } from '../../../ir/equals.ts';
import type { OptimizeContext } from '../../context.ts';
import type { OptimizerParams } from '../../params.ts';
import {
  absorbBinOps,
  expandBinOps,
} from './binOps.ts';
import { normalizeExpr } from './normalize.ts';

export function simplify(
  block: Block,
  params: OptimizerParams,
  ctx?: Readonly<OptimizeContext>,
): Block {
  ctx?.pushEnclosingBlock(block);
  try {
    return block.map((stmt) => simplifyStatement(stmt, params, ctx));
  } finally {
    ctx?.popEnclosingBlock();
  }
}

function simplifyStatement(
  stmt: Stmt,
  params: OptimizerParams,
  ctx?: Readonly<OptimizeContext>,
): Stmt {
  switch (stmt.kind) {
    case 'if':
      return {
        kind: 'if',
        cond: simplifyExpression(stmt.cond, params, ctx),
        body: simplify(stmt.body, params, ctx),
      };
    case 'foreach':
      return {
        ...stmt,
        body: simplify(stmt.body, params, ctx),
      };
    case 'return':
      return {
        kind: 'return',
        expr: simplifyExpression(stmt.expr, params, ctx),
      };
    default:
      return stmt;
  }
}

export function simplifyExpression(
  expr: Expr,
  params: OptimizerParams,
  ctx?: Readonly<OptimizeContext>,
): Expr {
  const expanded = expandBinOps(expr);
  if (!equals(expr, expanded)) {
    ctx?.trace.recordExpr('simplify.expand', expr, expanded);
  }
  let current = expanded;
  for (let i = 0; i < params.maxExpressionSimplificationLoops; i++) {
    const next = normalizeExpr(current, ctx);
    if (equals(current, next)) {
      break;
    }
    current = next;
  }
  const absorbed = absorbBinOps(current);
  if (!equals(current, absorbed)) {
    ctx?.trace.recordExpr('simplify.absorb', current, absorbed);
  }
  // Normalize may return a folded expr while skipped records left the live IR
  // behind (flat junction ≠ nested form). Commit the return value so checker
  // snapshots stay chained.
  syncLiveExpr(ctx, expr, absorbed);
  return absorbed;
}

/** Ensure enclosing live IR matches the simplify return value. */
function syncLiveExpr(
  ctx: Readonly<OptimizeContext> | undefined,
  original: Expr,
  result: Expr,
): void {
  if (ctx === undefined || equals(original, result)) {
    return;
  }
  if (ctx.trace.recordExpr('simplify.normalize.identity', original, result)) {
    return;
  }
  const root = ctx.enclosingRoot;
  if (root === null || root.length !== 1 || root[0].kind !== 'return') {
    return;
  }
  const live = root[0].expr;
  if (!equals(live, result)) {
    ctx.trace.recordExpr('simplify.normalize.identity', live, result);
  }
}
