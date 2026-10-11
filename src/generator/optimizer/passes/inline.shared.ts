import type { CheckerIR, CheckerProgram, Expr } from '../../ir/types.ts';
import {
  collectCallCheckerNames,
  substituteExpr,
} from '../../ir/substitute.ts';
import type { OptimizeContext } from '../context.ts';

export function isSingleReturn(
  program: CheckerProgram,
): program is CheckerProgram & {
  body: [{ kind: 'return'; expr: Expr }];
} {
  return program.body.length === 1 && program.body[0].kind === 'return';
}

export function getCallee(ir: CheckerIR, name: string): CheckerProgram | null {
  return ir.programs[name] ?? null;
}

function wouldRecurse(
  callee: CheckerProgram,
  currentProgram: string,
): boolean {
  const refs = collectCallCheckerNames(callee.body);
  return refs.has(currentProgram);
}

export function canInline(
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

export function inlineCallCheckerExpr(
  expr: Extract<Expr, { kind: 'call_checker' }>,
  ir: CheckerIR,
  programName: string,
  ctx?: Readonly<OptimizeContext>,
): Expr | null {
  const callee = getCallee(ir, expr.name);
  if (callee === null || !canInline(expr.name, callee, programName, ir)) {
    return null;
  }
  if (!isSingleReturn(callee)) {
    return null;
  }
  const next = substituteExpr(callee.body[0].expr, expr.subject);
  ctx?.trace.recordExpr('inline.substitute', expr, next, {
    kind: 'inline',
    callee: expr.name,
  });
  return next;
}

export function findFirstCallChecker(
  exprs: readonly Expr[],
): { index: number; call: Extract<Expr, { kind: 'call_checker' }> } | null {
  for (let i = 0; i < exprs.length; i++) {
    const e = exprs[i];
    if (e.kind === 'call_checker') {
      return { index: i, call: e };
    }
  }
  return null;
}
