import type { Block, Expr, Stmt } from '../../../ir/types.ts';
import { equals } from '../../../ir/equals.ts';
import type { OptimizeContext } from '../../context.ts';
import type { OptimizerParams } from '../../params.ts';
import {
  absorbBinOps,
  expandBinOps,
} from './binOps.ts';
import { normalizeExpr, normalizeQuiet } from './normalize.ts';

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

/**
 * Expand → normalize* → absorb. Quiet-compute first; if the net result equals
 * the input, return without touching live IR / trace (kills confirmation-round
 * `>` ⇄ `!(<=)` ping-pong). Only when the net result differs do we commit with
 * live tracing (normalize with ctx), so checker snapshots stay honest.
 */
export function simplifyExpression(
  expr: Expr,
  params: OptimizerParams,
  ctx?: Readonly<OptimizeContext>,
): Expr {
  const quietResult = simplifyQuiet(expr, params, ctx);
  if (equals(expr, quietResult)) {
    return expr;
  }
  if (ctx === undefined) {
    return quietResult;
  }
  return simplifyTraced(expr, params, ctx);
}

/** Value-only expand → normalize* → absorb (no live IR / trace updates). */
function simplifyQuiet(
  expr: Expr,
  params: OptimizerParams,
  ctx: Readonly<OptimizeContext> | undefined,
): Expr {
  const expanded = expandBinOps(expr);
  let current = expanded;
  let converged = false;
  for (let i = 0; i < params.maxExpressionSimplificationLoops; i++) {
    const next = normalizeQuiet(current).result;
    if (equals(current, next)) {
      converged = true;
      break;
    }
    current = next;
  }
  if (!converged) {
    ctx?.stats.noteExprNormalizeCapped();
  }
  return absorbBinOps(current);
}

/** Live expand → normalize* → absorb with trace records. */
function simplifyTraced(
  expr: Expr,
  params: OptimizerParams,
  ctx: Readonly<OptimizeContext>,
): Expr {
  const expanded = expandBinOps(expr);
  if (!equals(expr, expanded)) {
    ctx.trace.recordExpr('simplify.expand', expr, expanded);
  }
  let current = expanded;
  let converged = false;
  for (let i = 0; i < params.maxExpressionSimplificationLoops; i++) {
    const next = normalizeExpr(current, ctx);
    if (equals(current, next)) {
      converged = true;
      break;
    }
    current = next;
  }
  if (!converged) {
    ctx.stats.noteExprNormalizeCapped();
  }
  const absorbed = absorbBinOps(current);
  if (!equals(current, absorbed)) {
    ctx.trace.recordExpr('simplify.absorb', current, absorbed);
  }
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
