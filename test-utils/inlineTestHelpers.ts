/** Shared helpers for optimizer inline tests. Not production code. */
import { expect } from 'vitest';
import type { Block, CheckerIR, Expr, Stmt } from '../src/generator/ir/types.ts';

export function expectForeach(
  stmt: Stmt | undefined,
): Extract<Stmt, { kind: 'foreach' }> {
  expect(stmt?.kind).toBe('foreach');
  if (stmt?.kind !== 'foreach') {
    throw new Error('expected foreach');
  }
  return stmt;
}

export function expectIf(
  stmt: Stmt | undefined,
): Extract<Stmt, { kind: 'if' }> {
  expect(stmt?.kind).toBe('if');
  if (stmt?.kind !== 'if') {
    throw new Error('expected if');
  }
  return stmt;
}

export function isNotGuardIf(stmt: Stmt): boolean {
  return stmt.kind === 'if' && stmt.cond.kind === 'not';
}

export function ir(
  programs: CheckerIR['programs'],
  order: readonly string[],
  entries?: readonly string[],
): CheckerIR {
  return {
    programs,
    order,
    entries: entries ?? (order[0] === undefined ? [] : [order[0]]),
  };
}

function exprHasCallChecker(expr: Expr): boolean {
  switch (expr.kind) {
    case 'call_checker':
      return true;
    case 'not':
      return exprHasCallChecker(expr.expr);
    case 'and':
    case 'or':
      return expr.exprs.some((child) => exprHasCallChecker(child));
    case 'bin':
    case 'bool':
    case 'call':
    case 'instanceof':
      return false;
    default:
      throw new Error('never reached');
  }
}

export function blockHasCallChecker(block: Block): boolean {
  for (const stmt of block) {
    switch (stmt.kind) {
      case 'return':
        if (exprHasCallChecker(stmt.expr)) {
          return true;
        }
        break;
      case 'if':
        if (exprHasCallChecker(stmt.cond) || blockHasCallChecker(stmt.body)) {
          return true;
        }
        break;
      case 'foreach':
        if (blockHasCallChecker(stmt.body)) {
          return true;
        }
        break;
      default:
        throw new Error('never reached');
    }
  }
  return false;
}
