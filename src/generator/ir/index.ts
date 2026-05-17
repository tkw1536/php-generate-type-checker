import type { Expr, Arg, Stmt, ValueRef } from './types.ts';

export function boolLit(value: boolean): Expr {
  return { kind: 'bool', value };
}

export function notExpr(expr: Expr): Expr {
  return { kind: 'not', expr };
}

export function andExpr(exprs: Expr[]): Expr {
  if (exprs.length === 1) {
    return exprs[0];
  }
  return { kind: 'and', exprs };
}

export function orExpr(exprs: Expr[]): Expr {
  if (exprs.length === 1) {
    return exprs[0];
  }
  return { kind: 'or', exprs };
}

export function callExpr(name: string, args: Arg[]): Expr {
  return { kind: 'call', name, args };
}

export function binExpr(
  op: Extract<Expr, { kind: 'bin' }>['op'],
  left: Arg,
  right: Arg,
): Expr {
  return { kind: 'bin', op, left, right };
}

export function instanceofExpr(subject: Arg, className: string): Expr {
  return { kind: 'instanceof', subject, className };
}

export function callCheckerExpr(name: string, subject: ValueRef): Expr {
  return { kind: 'call_checker', name, subject };
}

export function refArg(ref: ValueRef): Arg {
  return { kind: 'ref', ref };
}

export function literalArg(value: string): Arg {
  return { kind: 'literal', value };
}

export function callArg(name: string, args: Arg[]): Arg {
  return { kind: 'call', name, args };
}

export function failIfStmt(guard: Expr): Stmt {
  return {
    kind: 'if',
    cond: notExpr(guard),
    body: [{ kind: 'return', expr: boolLit(false) }],
  };
}

export function returnStmt(expr: Expr): Stmt {
  return { kind: 'return', expr };
}

export function variableRef(name: string): ValueRef {
  return { kind: 'variable', name };
}

export function arrayAccessRef(
  object: ValueRef,
  key: string | number,
): ValueRef {
  return { kind: 'array_access', object, key };
}

export function propertyAccessRef(object: ValueRef, name: string): ValueRef {
  return { kind: 'property_access', object, name };
}
