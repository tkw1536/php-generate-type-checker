import type { Block, CheckerIR, Expr, Stmt } from '../../ir/types.ts';
import { boolLit, notExpr, returnStmt } from '../../ir/index.ts';
import { substituteProgramBody } from '../../ir/substitute.ts';
import type { OptimizeContext } from '../context.ts';
import type { BlockPassResult } from '../pass.ts';
import { commitReason } from '../trace/commit.ts';
import { blockStep, mergeExprRewrites } from '../trace/rewrite.ts';
import type {
  ExprRewrite,
  TracePos,
  TraceReasoning,
} from '../trace/types.ts';
import {
  canInline,
  findFirstCallChecker,
  getCallee,
  inlineCallCheckerExpr,
} from './inline.shared.ts';

export function commitInlineBlock(
  callee: string,
  before: Block,
  body: Block,
  ctx: Readonly<OptimizeContext> | undefined,
  pos: TracePos,
  children: readonly TraceReasoning[] = [],
): { readonly block: Block; readonly pos: TracePos } {
  if (ctx === undefined) {
    return { block: body, pos };
  }
  const nextPos = commitReason(
    ctx,
    pos,
    blockStep('inline.substitute', before, body, children, {
      kind: 'inline',
      callee,
    }),
  );
  return { block: body, pos: nextPos };
}

function inlineOrOfSingleReturnCalls(
  expr: Extract<Expr, { kind: 'or' }>,
  ir: CheckerIR,
  programName: string,
): ExprRewrite | null {
  if (!expr.exprs.every((e) => e.kind === 'call_checker')) {
    return null;
  }
  const parts: ExprRewrite[] = [];
  const inlined: Expr[] = [];
  for (const e of expr.exprs) {
    if (e.kind !== 'call_checker') {
      return null;
    }
    const replacement = inlineCallCheckerExpr(e, ir, programName);
    if (replacement === null) {
      return null;
    }
    parts.push(replacement);
    inlined.push(replacement.expr);
  }
  const after: Expr =
    inlined.length === 1 ? inlined[0] : { kind: 'or', exprs: inlined };
  return mergeExprRewrites(after, parts);
}

export function peelOrReturn(
  stmt: Extract<Stmt, { kind: 'return' }>,
  ir: CheckerIR,
  programName: string,
  ctx: Readonly<OptimizeContext> | undefined,
  pos: TracePos,
): BlockPassResult | null {
  if (stmt.expr.kind !== 'or') {
    return null;
  }
  if (stmt.expr.exprs.every((e) => e.kind === 'call_checker')) {
    const rewritten = inlineOrOfSingleReturnCalls(stmt.expr, ir, programName);
    if (rewritten === null) {
      return null;
    }
    const body = [returnStmt(rewritten.expr)];
    if (ctx !== undefined) {
      return { block: body, pos: commitReason(ctx, pos, rewritten.reason) };
    }
    return { block: body, pos };
  }
  const hit = findFirstCallChecker(stmt.expr.exprs);
  if (hit === null) {
    return null;
  }
  const callee = getCallee(ir, hit.call.name);
  if (callee === null || !canInline(hit.call.name, callee, programName, ir)) {
    return null;
  }
  const other = stmt.expr.exprs.filter((_, i) => i !== hit.index);
  if (other.some((arm) => arm.kind === 'call_checker')) {
    return null;
  }
  const prefix: Stmt[] = [];
  for (const arm of other) {
    prefix.push({
      kind: 'if',
      cond: arm,
      body: [returnStmt(boolLit(true))],
    });
  }
  const body = [...prefix, ...substituteProgramBody(callee, hit.call.subject)];
  return commitInlineBlock(hit.call.name, [stmt], body, ctx, pos);
}

export function peelAndReturn(
  stmt: Extract<Stmt, { kind: 'return' }>,
  ir: CheckerIR,
  programName: string,
  ctx: Readonly<OptimizeContext> | undefined,
  pos: TracePos,
): BlockPassResult | null {
  if (stmt.expr.kind !== 'and') {
    return null;
  }
  const hit = findFirstCallChecker(stmt.expr.exprs);
  if (hit === null) {
    return null;
  }
  const callee = getCallee(ir, hit.call.name);
  if (callee === null || !canInline(hit.call.name, callee, programName, ir)) {
    return null;
  }
  const other = stmt.expr.exprs.filter((_, i) => i !== hit.index);
  if (other.some((arm) => arm.kind === 'call_checker')) {
    return null;
  }
  const prefix: Stmt[] = [];
  for (const arm of other) {
    prefix.push({
      kind: 'if',
      cond: notExpr(arm),
      body: [returnStmt(boolLit(false))],
    });
  }
  const body = [...prefix, ...substituteProgramBody(callee, hit.call.subject)];
  return commitInlineBlock(hit.call.name, [stmt], body, ctx, pos);
}
