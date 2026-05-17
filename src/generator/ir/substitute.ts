import type { Arg, Block, CheckerProgram, Expr, Stmt, ValueRef } from './types.ts';
import { arrayAccessRef, propertyAccessRef } from './index.ts';

function cloneValueRef(ref: ValueRef): ValueRef {
  switch (ref.kind) {
    case 'variable':
      return { kind: 'variable', name: ref.name };
    case 'array_access':
      return {
        kind: 'array_access',
        object: cloneValueRef(ref.object),
        key: ref.key,
      };
    case 'property_access':
      return {
        kind: 'property_access',
        object: cloneValueRef(ref.object),
        name: ref.name,
      };
    default: {
      const _exhaustive: never = ref;
      return _exhaustive;
    }
  }
}

function isParameterVariable(ref: ValueRef, parameter: string): boolean {
  return ref.kind === 'variable' && ref.name === parameter;
}

export function substituteValueRef(
  ref: ValueRef,
  parameter: string,
  subject: ValueRef,
): ValueRef {
  switch (ref.kind) {
    case 'variable':
      if (ref.name === parameter) {
        return cloneValueRef(subject);
      }
      return cloneValueRef(ref);
    case 'array_access':
      if (isParameterVariable(ref.object, parameter)) {
        return arrayAccessRef(cloneValueRef(subject), ref.key);
      }
      return arrayAccessRef(
        substituteValueRef(ref.object, parameter, subject),
        ref.key,
      );
    case 'property_access':
      if (isParameterVariable(ref.object, parameter)) {
        return propertyAccessRef(cloneValueRef(subject), ref.name);
      }
      return propertyAccessRef(
        substituteValueRef(ref.object, parameter, subject),
        ref.name,
      );
    default: {
      const _exhaustive: never = ref;
      return _exhaustive;
    }
  }
}

function substituteArg(arg: Arg, parameter: string, subject: ValueRef): Arg {
  switch (arg.kind) {
    case 'ref':
      return { kind: 'ref', ref: substituteValueRef(arg.ref, parameter, subject) };
    case 'literal':
      return { kind: 'literal', value: arg.value };
    case 'call':
      return {
        kind: 'call',
        name: arg.name,
        args: arg.args.map((a) => substituteArg(a, parameter, subject)),
      };
    default: {
      const _exhaustive: never = arg;
      return _exhaustive;
    }
  }
}

export function substituteExpr(
  expr: Expr,
  parameter: string,
  subject: ValueRef,
): Expr {
  switch (expr.kind) {
    case 'bool':
      return { kind: 'bool', value: expr.value };
    case 'not':
      return {
        kind: 'not',
        expr: substituteExpr(expr.expr, parameter, subject),
      };
    case 'and':
      return {
        kind: 'and',
        exprs: expr.exprs.map((e) => substituteExpr(e, parameter, subject)),
      };
    case 'or':
      return {
        kind: 'or',
        exprs: expr.exprs.map((e) => substituteExpr(e, parameter, subject)),
      };
    case 'call':
      return {
        kind: 'call',
        name: expr.name,
        args: expr.args.map((a) => substituteArg(a, parameter, subject)),
      };
    case 'bin':
      return {
        kind: 'bin',
        op: expr.op,
        left: substituteArg(expr.left, parameter, subject),
        right: substituteArg(expr.right, parameter, subject),
      };
    case 'instanceof':
      return {
        kind: 'instanceof',
        className: expr.className,
        subject: substituteArg(expr.subject, parameter, subject),
      };
    case 'call_checker':
      return {
        kind: 'call_checker',
        name: expr.name,
        subject: substituteValueRef(expr.subject, parameter, subject),
      };
    default: {
      const _exhaustive: never = expr;
      return _exhaustive;
    }
  }
}

export function substituteStmt(
  stmt: Stmt,
  parameter: string,
  subject: ValueRef,
): Stmt {
  switch (stmt.kind) {
    case 'if':
      return {
        kind: 'if',
        cond: substituteExpr(stmt.cond, parameter, subject),
        body: substituteBlock(stmt.body, parameter, subject),
      };
    case 'foreach':
      return {
        ...stmt,
        iterable: substituteValueRef(stmt.iterable, parameter, subject),
        body: substituteBlock(stmt.body, parameter, subject),
      };
    case 'return':
      return {
        kind: 'return',
        expr: substituteExpr(stmt.expr, parameter, subject),
      };
    default: {
      const _exhaustive: never = stmt;
      return _exhaustive;
    }
  }
}

export function substituteBlock(
  block: Block,
  parameter: string,
  subject: ValueRef,
): Block {
  return block.map((stmt) => substituteStmt(stmt, parameter, subject));
}

export function substituteProgramBody(
  program: CheckerProgram,
  subject: ValueRef,
): Block {
  return substituteBlock(program.body, program.parameter, subject);
}

export function collectCallCheckerNames(block: Block): Set<string> {
  const names = new Set<string>();
  walkBlock(block, names);
  return names;
}

function walkBlock(block: Block, names: Set<string>): void {
  for (const stmt of block) {
    walkStmt(stmt, names);
  }
}

function walkStmt(stmt: Stmt, names: Set<string>): void {
  switch (stmt.kind) {
    case 'if':
      walkExpr(stmt.cond, names);
      walkBlock(stmt.body, names);
      break;
    case 'foreach':
      walkValueRef(stmt.iterable, names);
      walkBlock(stmt.body, names);
      break;
    case 'return':
      walkExpr(stmt.expr, names);
      break;
    default: {
      const _exhaustive: never = stmt;
      return _exhaustive;
    }
  }
}

function walkExpr(expr: Expr, names: Set<string>): void {
  switch (expr.kind) {
    case 'bool':
      return;
    case 'not':
      walkExpr(expr.expr, names);
      return;
    case 'and':
    case 'or':
      for (const e of expr.exprs) {
        walkExpr(e, names);
      }
      return;
    case 'call':
      for (const a of expr.args) {
        walkArg(a, names);
      }
      return;
    case 'bin':
      walkArg(expr.left, names);
      walkArg(expr.right, names);
      return;
    case 'instanceof':
      walkArg(expr.subject, names);
      return;
    case 'call_checker':
      names.add(expr.name);
      walkValueRef(expr.subject, names);
      return;
    default: {
      const _exhaustive: never = expr;
      return _exhaustive;
    }
  }
}

function walkArg(arg: Arg, names: Set<string>): void {
  switch (arg.kind) {
    case 'ref':
      walkValueRef(arg.ref, names);
      return;
    case 'literal':
      return;
    case 'call':
      for (const a of arg.args) {
        walkArg(a, names);
      }
      return;
    default: {
      const _exhaustive: never = arg;
      return _exhaustive;
    }
  }
}

function walkValueRef(ref: ValueRef, names: Set<string>): void {
  switch (ref.kind) {
    case 'variable':
      return;
    case 'array_access':
      walkValueRef(ref.object, names);
      return;
    case 'property_access':
      walkValueRef(ref.object, names);
      return;
    default: {
      const _exhaustive: never = ref;
      return _exhaustive;
    }
  }
}
