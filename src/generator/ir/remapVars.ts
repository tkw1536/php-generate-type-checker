import type { Arg, Block, Expr, Stmt, ValueRef } from './types.ts';

/** Rewrite variable ids in a block (refs and foreach binder slots). */
export function remapBlockVars(
  block: Block,
  map: ReadonlyMap<number, number>,
): Block {
  if (map.size === 0) {
    return block;
  }
  return block.map((stmt) => remapStmtVars(stmt, map));
}

function remapId(id: number, map: ReadonlyMap<number, number>): number {
  return map.get(id) ?? id;
}

function remapValueRef(
  ref: ValueRef,
  map: ReadonlyMap<number, number>,
): ValueRef {
  switch (ref.kind) {
    case 'parameter':
      return ref;
    case 'variable':
      return { kind: 'variable', id: remapId(ref.id, map) };
    case 'array_access':
      return {
        kind: 'array_access',
        object: remapValueRef(ref.object, map),
        key: ref.key,
      };
    case 'property_access':
      return {
        kind: 'property_access',
        object: remapValueRef(ref.object, map),
        name: ref.name,
      };
    default:
      throw new Error('never reached');
  }
}

function remapArg(arg: Arg, map: ReadonlyMap<number, number>): Arg {
  switch (arg.kind) {
    case 'ref':
      return { kind: 'ref', ref: remapValueRef(arg.ref, map) };
    case 'literal':
      return arg;
    case 'call':
      return {
        kind: 'call',
        name: arg.name,
        args: arg.args.map((a) => remapArg(a, map)),
      };
    default:
      throw new Error('never reached');
  }
}

function remapExpr(expr: Expr, map: ReadonlyMap<number, number>): Expr {
  switch (expr.kind) {
    case 'bool':
      return expr;
    case 'not':
      return { kind: 'not', expr: remapExpr(expr.expr, map) };
    case 'and':
    case 'or':
      return {
        kind: expr.kind,
        exprs: expr.exprs.map((e) => remapExpr(e, map)),
      };
    case 'call':
      return {
        kind: 'call',
        name: expr.name,
        args: expr.args.map((a) => remapArg(a, map)),
      };
    case 'bin':
      return {
        kind: 'bin',
        op: expr.op,
        left: remapArg(expr.left, map),
        right: remapArg(expr.right, map),
      };
    case 'instanceof':
      return {
        kind: 'instanceof',
        className: expr.className,
        subject: remapArg(expr.subject, map),
      };
    case 'call_checker':
      return {
        kind: 'call_checker',
        name: expr.name,
        subject: remapValueRef(expr.subject, map),
      };
    default:
      throw new Error('never reached');
  }
}

function remapStmtVars(stmt: Stmt, map: ReadonlyMap<number, number>): Stmt {
  switch (stmt.kind) {
    case 'if':
      return {
        kind: 'if',
        cond: remapExpr(stmt.cond, map),
        body: remapBlockVars(stmt.body, map),
      };
    case 'foreach':
      return {
        kind: 'foreach',
        iterable: remapValueRef(stmt.iterable, map),
        keyVar: stmt.keyVar === null ? null : remapId(stmt.keyVar, map),
        valueVar: remapId(stmt.valueVar, map),
        body: remapBlockVars(stmt.body, map),
      };
    case 'return':
      return {
        kind: 'return',
        expr: remapExpr(stmt.expr, map),
      };
    default:
      throw new Error('never reached');
  }
}
