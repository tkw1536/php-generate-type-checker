import type { Block, CheckerIR, Expr, Stmt } from '../../ir/types.ts';
import { notExpr, returnStmt } from '../../ir/index.ts';
import { substituteProgramBody } from '../../ir/substitute.ts';
import type { OptimizeContext } from '../context.ts';
import { negateBlockTraced } from '../lib/negate.ts';
import type { BlockPass, BlockPassResult } from '../pass.ts';
import { commitReason, withScope } from '../trace/commit.ts';
import { seqReason, unchangedExpr } from '../trace/rewrite.ts';
import type { ExprRewrite, TracePos, TraceReasoning } from '../trace/types.ts';
import {
  commitInlineBlock,
  peelAndReturn,
  peelOrReturn,
} from './inline.peel.ts';
import {
  canInline,
  getCallee,
  inlineCallCheckerExpr,
} from './inline.shared.ts';

function inlineCallOrNegated(
  stmt: Extract<Stmt, { kind: 'return' }>,
  ir: CheckerIR,
  programName: string,
  ctx: Readonly<OptimizeContext> | undefined,
  pos: TracePos,
): BlockPassResult | null {
  if (stmt.expr.kind === 'call_checker') {
    const callee = getCallee(ir, stmt.expr.name);
    if (callee === null || !canInline(stmt.expr.name, callee, programName, ir)) {
      return null;
    }
    return commitInlineBlock(
      stmt.expr.name,
      [stmt],
      substituteProgramBody(callee, stmt.expr.subject),
      ctx,
      pos,
    );
  }
  if (stmt.expr.kind === 'not' && stmt.expr.expr.kind === 'call_checker') {
    const call = stmt.expr.expr;
    const callee = getCallee(ir, call.name);
    if (callee === null || !canInline(call.name, callee, programName, ir)) {
      return null;
    }
    const negated = negateBlockTraced(
      substituteProgramBody(callee, call.subject),
    );
    return commitInlineBlock(
      call.name,
      [stmt],
      negated.block,
      ctx,
      pos,
      negated.children,
    );
  }
  return null;
}

function inlineReturnStmt(
  stmt: Extract<Stmt, { kind: 'return' }>,
  ir: CheckerIR,
  programName: string,
  ctx: Readonly<OptimizeContext> | undefined,
  pos: TracePos,
): BlockPassResult | null {
  const peeledOr = peelOrReturn(stmt, ir, programName, ctx, pos);
  if (peeledOr !== null) {
    return peeledOr;
  }
  const peeledAnd = peelAndReturn(stmt, ir, programName, ctx, pos);
  if (peeledAnd !== null) {
    return peeledAnd;
  }
  const inlinedExpr = inlineExpr(stmt.expr, ir, programName);
  if (inlinedExpr.reason.kind !== 'none') {
    let currentPos = pos;
    if (ctx !== undefined) {
      currentPos = commitReason(ctx, pos, inlinedExpr.reason);
    }
    return { block: [returnStmt(inlinedExpr.expr)], pos: currentPos };
  }
  return inlineCallOrNegated(stmt, ir, programName, ctx, pos);
}

function inlineExpr(
  expr: Expr,
  ir: CheckerIR,
  programName: string,
): ExprRewrite {
  switch (expr.kind) {
    case 'call_checker': {
      const next = inlineCallCheckerExpr(expr, ir, programName);
      return next ?? unchangedExpr(expr);
    }
    case 'not': {
      const inner = inlineExpr(expr.expr, ir, programName);
      if (inner.reason.kind === 'none') {
        return unchangedExpr(expr);
      }
      return { expr: notExpr(inner.expr), reason: inner.reason };
    }
    case 'and':
    case 'or': {
      const parts: TraceReasoning[] = [];
      let changed = false;
      const exprs = expr.exprs.map((e) => {
        const next = inlineExpr(e, ir, programName);
        if (next.reason.kind !== 'none') {
          changed = true;
          parts.push(next.reason);
          return next.expr;
        }
        return e;
      });
      if (!changed) {
        return unchangedExpr(expr);
      }
      return { expr: { ...expr, exprs }, reason: seqReason(parts) };
    }
    case 'bin':
    case 'bool':
    case 'call':
    case 'instanceof':
      return unchangedExpr(expr);
    default:
      throw new Error('never reached');
  }
}

function inlineIfStmt(
  stmt: Extract<Stmt, { kind: 'if' }>,
  ir: CheckerIR,
  programName: string,
  ctx: Readonly<OptimizeContext> | undefined,
  pos: TracePos,
): BlockPassResult {
  const cond = inlineExpr(stmt.cond, ir, programName);
  let currentPos = pos;
  if (ctx !== undefined && cond.reason.kind !== 'none') {
    currentPos = commitReason(ctx, currentPos, cond.reason);
  }
  const body = inlineBlock(
    stmt.body,
    ir,
    programName,
    ctx,
    withScope(currentPos, stmt.body),
  );
  return {
    block: [{ kind: 'if', cond: cond.expr, body: body.block }],
    pos: body.pos,
  };
}

function inlineStmt(
  stmt: Stmt,
  ir: CheckerIR,
  programName: string,
  ctx: Readonly<OptimizeContext> | undefined,
  pos: TracePos,
): BlockPassResult {
  switch (stmt.kind) {
    case 'return': {
      const replaced = inlineReturnStmt(stmt, ir, programName, ctx, pos);
      return replaced ?? { block: [stmt], pos };
    }
    case 'if':
      return inlineIfStmt(stmt, ir, programName, ctx, pos);
    case 'foreach': {
      const body = inlineBlock(
        stmt.body,
        ir,
        programName,
        ctx,
        withScope(pos, stmt.body),
      );
      return { block: [{ ...stmt, body: body.block }], pos: body.pos };
    }
    default:
      throw new Error('never reached');
  }
}

export function inlineBlock(
  block: Block,
  ir: CheckerIR,
  programName: string,
  ctx?: Readonly<OptimizeContext>,
  pos?: TracePos,
): BlockPassResult {
  let currentPos = pos ?? { checker: block, scope: block };
  const out: Stmt[] = [];
  for (const stmt of block) {
    const next = inlineStmt(stmt, ir, programName, ctx, currentPos);
    out.push(...next.block);
    currentPos = next.pos;
  }
  return { block: out, pos: currentPos };
}

export const inlinePass: BlockPass = {
  id: 'inline',
  run(block, ctx, pos) {
    return inlineBlock(block, ctx.ir, ctx.program, ctx, pos);
  },
};
