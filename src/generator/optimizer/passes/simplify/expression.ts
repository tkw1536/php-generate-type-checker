import type { Block, Expr, Stmt } from '../../../ir/types.ts';
import { equals } from '../../../ir/equals.ts';
import type { OptimizeContext } from '../../context.ts';
import type { BlockPassResult } from '../../pass.ts';
import type { OptimizerParams } from '../../params.ts';
import { commitReason, withScope } from '../../trace/commit.ts';
import {
  exprRewrite,
  exprStep,
  flattenReasons,
  seqReason,
} from '../../trace/rewrite.ts';
import type { ExprRewrite, TracePos, TraceReasoning } from '../../trace/types.ts';
import { absorbBinOps, expandBinOps } from './binOps.ts';
import { normalizeExpr } from './normalize.ts';

export function simplify(
  block: Block,
  params: OptimizerParams,
  ctx?: Readonly<OptimizeContext>,
  pos?: TracePos,
): BlockPassResult {
  let currentPos = pos ?? { checker: block, scope: block };
  const out: Stmt[] = [];
  for (const stmt of block) {
    const next = simplifyStatement(stmt, params, ctx, currentPos);
    out.push(next.stmt);
    currentPos = next.pos;
  }
  return { block: out, pos: currentPos };
}

function simplifyStatement(
  stmt: Stmt,
  params: OptimizerParams,
  ctx: Readonly<OptimizeContext> | undefined,
  pos: TracePos,
): { readonly stmt: Stmt; readonly pos: TracePos } {
  switch (stmt.kind) {
    case 'if': {
      const cond = simplifyExpression(stmt.cond, params, ctx, pos);
      const body = simplify(
        stmt.body,
        params,
        ctx,
        withScope(cond.pos, stmt.body),
      );
      return {
        stmt: { kind: 'if', cond: cond.expr, body: body.block },
        pos: body.pos,
      };
    }
    case 'foreach': {
      const body = simplify(stmt.body, params, ctx, withScope(pos, stmt.body));
      return {
        stmt: { ...stmt, body: body.block },
        pos: body.pos,
      };
    }
    case 'return': {
      const expr = simplifyExpression(stmt.expr, params, ctx, pos);
      return {
        stmt: { kind: 'return', expr: expr.expr },
        pos: expr.pos,
      };
    }
    default:
      throw new Error('never reached');
  }
}

/**
 * Expand → normalize* → absorb. Quiet-compute first; if the net result equals
 * the input, return reason none (no commits). Otherwise commit each step.
 */
export function simplifyExpression(
  expr: Expr,
  params: OptimizerParams,
  ctx?: Readonly<OptimizeContext>,
  pos?: TracePos,
): { readonly expr: Expr; readonly pos: TracePos } {
  const currentPos = pos ?? { checker: [], scope: [] };
  const quietResult = simplifyQuiet(expr, params, ctx);
  if (equals(expr, quietResult.expr)) {
    return { expr, pos: currentPos };
  }
  if (ctx === undefined) {
    return { expr: quietResult.expr, pos: currentPos };
  }
  return simplifyTraced(expr, params, ctx, currentPos);
}

/** Value-only expand → normalize* → absorb (builds reason, no commits). */
function simplifyQuiet(
  expr: Expr,
  params: OptimizerParams,
  ctx: Readonly<OptimizeContext> | undefined,
): ExprRewrite {
  const expanded = expandBinOps(expr);
  const parts: TraceReasoning[] = [];
  let current = expr;
  if (!equals(expr, expanded)) {
    parts.push(exprRewrite('simplify.expand', expr, expanded).reason);
    current = expanded;
  }
  let converged = false;
  for (let i = 0; i < params.maxExpressionSimplificationLoops; i++) {
    const next = normalizeExpr(current);
    if (next.reason.kind === 'none') {
      converged = true;
      break;
    }
    parts.push(next.reason);
    current = next.expr;
  }
  if (!converged) {
    ctx?.stats.noteExprNormalizeCapped();
  }
  const absorbed = absorbBinOps(current);
  if (!equals(current, absorbed)) {
    parts.push(exprRewrite('simplify.absorb', current, absorbed).reason);
    current = absorbed;
  }
  return { expr: current, reason: seqReason(parts) };
}

function commitExpand(
  ctx: Readonly<OptimizeContext>,
  pos: TracePos,
  before: Expr,
  expanded: Expr,
): { readonly expr: Expr; readonly pos: TracePos } {
  if (equals(before, expanded)) {
    return { expr: before, pos };
  }
  return {
    expr: expanded,
    pos: commitReason(
      ctx,
      pos,
      exprRewrite('simplify.expand', before, expanded).reason,
    ),
  };
}

function commitNormalizeFixpoint(
  ctx: Readonly<OptimizeContext>,
  pos: TracePos,
  expr: Expr,
  params: OptimizerParams,
): { readonly expr: Expr; readonly pos: TracePos } {
  // Normalize may record reconstructed junctions that are not literally in the
  // live IR. Commit one before→after for the whole fixpoint; nest micro-steps.
  const beforeNorm = expr;
  const normParts: TraceReasoning[] = [];
  let current = expr;
  let converged = false;
  for (let i = 0; i < params.maxExpressionSimplificationLoops; i++) {
    const next = normalizeExpr(current);
    if (next.reason.kind === 'none') {
      converged = true;
      break;
    }
    normParts.push(next.reason);
    current = next.expr;
  }
  if (!converged) {
    ctx.stats.noteExprNormalizeCapped();
  }
  if (equals(beforeNorm, current)) {
    return { expr: current, pos };
  }
  const children = flattenReasons(seqReason(normParts));
  return {
    expr: current,
    pos: commitReason(
      ctx,
      pos,
      exprStep('simplify.normalize', beforeNorm, current, children),
    ),
  };
}

/** Live expand → normalize* → absorb with checker commits. */
function simplifyTraced(
  expr: Expr,
  params: OptimizerParams,
  ctx: Readonly<OptimizeContext>,
  pos: TracePos,
): { readonly expr: Expr; readonly pos: TracePos } {
  const expanded = commitExpand(ctx, pos, expr, expandBinOps(expr));
  const normalized = commitNormalizeFixpoint(
    ctx,
    expanded.pos,
    expanded.expr,
    params,
  );
  const absorbed = absorbBinOps(normalized.expr);
  if (equals(normalized.expr, absorbed)) {
    return normalized;
  }
  return {
    expr: absorbed,
    pos: commitReason(
      ctx,
      normalized.pos,
      exprRewrite('simplify.absorb', normalized.expr, absorbed).reason,
    ),
  };
}
