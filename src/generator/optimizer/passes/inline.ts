import type { Block, CheckerIR, Expr, Stmt } from '../../ir/types.ts';
import {
  boolLit,
  notExpr,
  returnStmt,
} from '../../ir/index.ts';
import { substituteProgramBody } from '../../ir/substitute.ts';
import type { OptimizeContext } from '../context.ts';
import { negateBlock } from '../lib/negate.ts';
import type { BlockPass } from '../pass.ts';
import {
  canInline,
  findFirstCallChecker,
  getCallee,
  inlineCallCheckerExpr,
} from './inline.shared.ts';

function recordInlineBlock(
  callee: string,
  before: Block,
  body: Block,
  ctx?: Readonly<OptimizeContext>,
): Block {
  ctx?.trace.recordBlock('inline.substitute', before, body, {
    kind: 'inline',
    callee,
  });
  return body;
}

function inlineOrOfSingleReturnCalls(
  expr: Extract<Expr, { kind: 'or' }>,
  ir: CheckerIR,
  programName: string,
  ctx?: Readonly<OptimizeContext>,
): Block | null {
  if (!expr.exprs.every((e) => e.kind === 'call_checker')) {
    return null;
  }
  const inlined: Expr[] = [];
  for (const e of expr.exprs) {
    if (e.kind !== 'call_checker') {
      return null;
    }
    const replacement = inlineCallCheckerExpr(e, ir, programName, ctx);
    if (replacement === null) {
      return null;
    }
    inlined.push(replacement);
  }
  return [
    returnStmt(
      inlined.length === 1 ? inlined[0] : { kind: 'or', exprs: inlined },
    ),
  ];
}

function peelOrReturn(
  stmt: Extract<Stmt, { kind: 'return' }>,
  ir: CheckerIR,
  programName: string,
  ctx?: Readonly<OptimizeContext>,
): Block | null {
  if (stmt.expr.kind !== 'or') {
    return null;
  }
  if (stmt.expr.exprs.every((e) => e.kind === 'call_checker')) {
    return inlineOrOfSingleReturnCalls(stmt.expr, ir, programName, ctx);
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
  return recordInlineBlock(hit.call.name, [stmt], body, ctx);
}

function peelAndReturn(
  stmt: Extract<Stmt, { kind: 'return' }>,
  ir: CheckerIR,
  programName: string,
  ctx?: Readonly<OptimizeContext>,
): Block | null {
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
  return recordInlineBlock(hit.call.name, [stmt], body, ctx);
}

function inlineReturnStmt(
  stmt: Extract<Stmt, { kind: 'return' }>,
  ir: CheckerIR,
  programName: string,
  ctx?: Readonly<OptimizeContext>,
): Block | null {
  const peeledOr = peelOrReturn(stmt, ir, programName, ctx);
  if (peeledOr !== null) {
    return peeledOr;
  }
  const peeledAnd = peelAndReturn(stmt, ir, programName, ctx);
  if (peeledAnd !== null) {
    return peeledAnd;
  }

  const inlinedExpr = inlineExpr(stmt.expr, ir, programName, ctx);
  if (inlinedExpr !== null) {
    return [returnStmt(inlinedExpr)];
  }

  if (stmt.expr.kind === 'call_checker') {
    const callee = getCallee(ir, stmt.expr.name);
    if (callee === null || !canInline(stmt.expr.name, callee, programName, ir)) {
      return null;
    }
    return recordInlineBlock(
      stmt.expr.name,
      [stmt],
      substituteProgramBody(callee, stmt.expr.subject),
      ctx,
    );
  }

  if (stmt.expr.kind === 'not' && stmt.expr.expr.kind === 'call_checker') {
    const call = stmt.expr.expr;
    const callee = getCallee(ir, call.name);
    if (callee === null || !canInline(call.name, callee, programName, ir)) {
      return null;
    }
    let body = substituteProgramBody(callee, call.subject);
    body = negateBlock(body);
    return recordInlineBlock(call.name, [stmt], body, ctx);
  }

  return null;
}

function inlineExpr(
  expr: Expr,
  ir: CheckerIR,
  programName: string,
  ctx?: Readonly<OptimizeContext>,
): Expr | null {
  switch (expr.kind) {
    case 'call_checker':
      return inlineCallCheckerExpr(expr, ir, programName, ctx);
    case 'not': {
      const inner = inlineExpr(expr.expr, ir, programName, ctx);
      return inner === null ? null : notExpr(inner);
    }
    case 'and':
    case 'or': {
      let changed = false;
      const exprs = expr.exprs.map((e) => {
        const next = inlineExpr(e, ir, programName, ctx);
        if (next !== null) {
          changed = true;
          return next;
        }
        return e;
      });
      return changed ? { ...expr, exprs } : null;
    }
    case 'bin':
    case 'bool':
    case 'call':
    case 'instanceof':
      return null;
    default:
      throw new Error('never reached');
  }
}

function inlineStmt(
  stmt: Stmt,
  ir: CheckerIR,
  programName: string,
  ctx?: Readonly<OptimizeContext>,
): Block {
  switch (stmt.kind) {
    case 'return': {
      const replaced = inlineReturnStmt(stmt, ir, programName, ctx);
      if (replaced !== null) {
        return replaced;
      }
      return [stmt];
    }
    case 'if':
      return [
        {
          kind: 'if',
          cond: inlineExpr(stmt.cond, ir, programName, ctx) ?? stmt.cond,
          body: inlineBlock(stmt.body, ir, programName, ctx),
        },
      ];
    case 'foreach':
      return [
        {
          ...stmt,
          body: inlineBlock(stmt.body, ir, programName, ctx),
        },
      ];
    default:
      throw new Error('never reached');
  }
}

export function inlineBlock(
  block: Block,
  ir: CheckerIR,
  programName: string,
  ctx?: Readonly<OptimizeContext>,
): Block {
  const out: Stmt[] = [];
  for (const stmt of block) {
    out.push(...inlineStmt(stmt, ir, programName, ctx));
  }
  return out;
}

export const inlinePass: BlockPass = {
  id: 'inline',
  run(block, ctx) {
    return inlineBlock(block, ctx.ir, ctx.program, ctx);
  },
};
