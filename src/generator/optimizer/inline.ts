import type { Block, CheckerIR, CheckerProgram, Expr, Stmt } from '../ir/types.ts';
import {
  boolLit,
  notExpr,
  returnStmt,
} from '../ir/index.ts';
import {
  collectCallCheckerNames,
  substituteExpr,
  substituteProgramBody,
} from '../ir/substitute.ts';

function isSingleReturn(program: CheckerProgram): program is CheckerProgram & {
  body: [{ kind: 'return'; expr: Expr }];
} {
  return (
    program.body.length === 1 && program.body[0]!.kind === 'return'
  );
}

export function negateBlock(block: Block): Block {
  return block.map((stmt) => negateStmt(stmt));
}

function negateStmt(stmt: Stmt): Stmt {
  switch (stmt.kind) {
    case 'return':
      return returnStmt(notExpr(stmt.expr));
    case 'if':
      return { ...stmt, body: negateBlock(stmt.body) };
    case 'foreach':
      return { ...stmt, body: negateBlock(stmt.body) };
    default: {
      const _exhaustive: never = stmt;
      return _exhaustive;
    }
  }
}

function getCallee(ir: CheckerIR, name: string): CheckerProgram | null {
  return ir.programs[name] ?? null;
}

function wouldRecurse(
  callee: CheckerProgram,
  currentProgram: string,
): boolean {
  const refs = collectCallCheckerNames(callee.body);
  if (refs.has(currentProgram)) {
    return true;
  }
  return false;
}

function canInline(
  calleeName: string,
  callee: CheckerProgram,
  currentProgram: string,
  ir: CheckerIR,
): boolean {
  if (calleeName === currentProgram) {
    return false;
  }
  if (ir.entries.includes(calleeName)) {
    return false;
  }
  if (wouldRecurse(callee, currentProgram)) {
    return false;
  }
  return true;
}

function inlineCallCheckerExpr(
  expr: Extract<Expr, { kind: 'call_checker' }>,
  ir: CheckerIR,
  programName: string,
): Expr | null {
  const callee = getCallee(ir, expr.name);
  if (callee === null || !canInline(expr.name, callee, programName, ir)) {
    return null;
  }
  if (!isSingleReturn(callee)) {
    return null;
  }
  return substituteExpr(callee.body[0]!.expr, callee.parameter, expr.subject);
}

function findFirstCallChecker(
  exprs: Expr[],
): { index: number; call: Extract<Expr, { kind: 'call_checker' }> } | null {
  for (let i = 0; i < exprs.length; i++) {
    const e = exprs[i]!;
    if (e.kind === 'call_checker') {
      return { index: i, call: e };
    }
  }
  return null;
}

function inlineOrOfSingleReturnCalls(
  expr: Extract<Expr, { kind: 'or' }>,
  ir: CheckerIR,
  programName: string,
): Stmt[] | null {
  if (!expr.exprs.every((e) => e.kind === 'call_checker')) {
    return null;
  }
  const inlined: Expr[] = [];
  for (const e of expr.exprs) {
    if (e.kind !== 'call_checker') {
      return null;
    }
    const replacement = inlineCallCheckerExpr(e, ir, programName);
    if (replacement === null) {
      return null;
    }
    inlined.push(replacement);
  }
  return [
    returnStmt(
      inlined.length === 1 ? inlined[0]! : { kind: 'or', exprs: inlined },
    ),
  ];
}

function peelOrReturn(
  stmt: Extract<Stmt, { kind: 'return' }>,
  ir: CheckerIR,
  programName: string,
): Stmt[] | null {
  if (stmt.expr.kind !== 'or') {
    return null;
  }
  if (stmt.expr.exprs.every((e) => e.kind === 'call_checker')) {
    return inlineOrOfSingleReturnCalls(stmt.expr, ir, programName);
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
  return [...prefix, ...substituteProgramBody(callee, hit.call.subject)];
}

function peelAndReturn(
  stmt: Extract<Stmt, { kind: 'return' }>,
  ir: CheckerIR,
  programName: string,
): Stmt[] | null {
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
  return [...prefix, ...substituteProgramBody(callee, hit.call.subject)];
}

function inlineReturnStmt(
  stmt: Extract<Stmt, { kind: 'return' }>,
  ir: CheckerIR,
  programName: string,
): Stmt[] | null {
  const peeledOr = peelOrReturn(stmt, ir, programName);
  if (peeledOr !== null) {
    return peeledOr;
  }
  const peeledAnd = peelAndReturn(stmt, ir, programName);
  if (peeledAnd !== null) {
    return peeledAnd;
  }

  const inlinedExpr = inlineExpr(stmt.expr, ir, programName);
  if (inlinedExpr !== null) {
    return [returnStmt(inlinedExpr)];
  }

  if (stmt.expr.kind === 'call_checker') {
    const callee = getCallee(ir, stmt.expr.name);
    if (callee === null || !canInline(stmt.expr.name, callee, programName, ir)) {
      return null;
    }
    return substituteProgramBody(callee, stmt.expr.subject);
  }

  if (stmt.expr.kind === 'not' && stmt.expr.expr.kind === 'call_checker') {
    const call = stmt.expr.expr;
    const callee = getCallee(ir, call.name);
    if (callee === null || !canInline(call.name, callee, programName, ir)) {
      return null;
    }
    let body = substituteProgramBody(callee, call.subject);
    body = negateBlock(body);
    return body;
  }

  return null;
}

function inlineExpr(expr: Expr, ir: CheckerIR, programName: string): Expr | null {
  switch (expr.kind) {
    case 'call_checker':
      return inlineCallCheckerExpr(expr, ir, programName);
    case 'not': {
      const inner = inlineExpr(expr.expr, ir, programName);
      return inner !== null ? notExpr(inner) : null;
    }
    case 'and':
    case 'or': {
      let changed = false;
      const exprs = expr.exprs.map((e) => {
        const next = inlineExpr(e, ir, programName);
        if (next !== null) {
          changed = true;
          return next;
        }
        return e;
      });
      return changed ? { ...expr, exprs } : null;
    }
    default:
      return null;
  }
}

function inlineStmt(stmt: Stmt, ir: CheckerIR, programName: string): Stmt[] {
  switch (stmt.kind) {
    case 'return': {
      const replaced = inlineReturnStmt(stmt, ir, programName);
      if (replaced !== null) {
        return replaced;
      }
      return [stmt];
    }
    case 'if':
      return [
        {
          kind: 'if',
          cond: inlineExpr(stmt.cond, ir, programName) ?? stmt.cond,
          body: inlineBlock(stmt.body, ir, programName),
        },
      ];
    case 'foreach':
      return [
        {
          ...stmt,
          body: inlineBlock(stmt.body, ir, programName),
        },
      ];
    default: {
      const _exhaustive: never = stmt;
      return [_exhaustive];
    }
  }
}

export function inlineBlock(
  block: Block,
  ir: CheckerIR,
  programName: string,
): Block {
  const out: Stmt[] = [];
  for (const stmt of block) {
    out.push(...inlineStmt(stmt, ir, programName));
  }
  return out;
}
