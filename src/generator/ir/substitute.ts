import type { Arg, Block, CheckerProgram, Expr, Stmt, ValueRef } from './types.ts';
import { arrayAccessRef, propertyAccessRef } from './index.ts';

function cloneValueRef(ref: ValueRef): ValueRef {
  switch (ref.kind) {
    case 'parameter':
      return { kind: 'parameter' };
    case 'variable':
      return { kind: 'variable', id: ref.id };
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
      const exhaustive: never = ref;
      return exhaustive;
    }
  }
}

function isParameter(ref: ValueRef): boolean {
  return ref.kind === 'parameter';
}

export function substituteValueRef(
  ref: ValueRef,
  subject: ValueRef,
): ValueRef {
  switch (ref.kind) {
    case 'parameter':
      return cloneValueRef(subject);
    case 'variable':
      return cloneValueRef(ref);
    case 'array_access':
      if (isParameter(ref.object)) {
        return arrayAccessRef(cloneValueRef(subject), ref.key);
      }
      return arrayAccessRef(
        substituteValueRef(ref.object, subject),
        ref.key,
      );
    case 'property_access':
      if (isParameter(ref.object)) {
        return propertyAccessRef(cloneValueRef(subject), ref.name);
      }
      return propertyAccessRef(
        substituteValueRef(ref.object, subject),
        ref.name,
      );
    default: {
      const exhaustive: never = ref;
      return exhaustive;
    }
  }
}

function substituteArg(arg: Arg, subject: ValueRef): Arg {
  switch (arg.kind) {
    case 'ref':
      return { kind: 'ref', ref: substituteValueRef(arg.ref, subject) };
    case 'literal':
      return { kind: 'literal', value: arg.value };
    case 'call':
      return {
        kind: 'call',
        name: arg.name,
        args: arg.args.map((a) => substituteArg(a, subject)),
      };
    default: {
      const exhaustive: never = arg;
      return exhaustive;
    }
  }
}

export function substituteExpr(expr: Expr, subject: ValueRef): Expr {
  switch (expr.kind) {
    case 'bool':
      return { kind: 'bool', value: expr.value };
    case 'not':
      return {
        kind: 'not',
        expr: substituteExpr(expr.expr, subject),
      };
    case 'and':
    case 'or':
      return {
        kind: expr.kind,
        exprs: expr.exprs.map((e) => substituteExpr(e, subject)),
      };
    case 'call':
    case 'bin':
    case 'instanceof':
    case 'call_checker':
      return substituteLeafExpr(expr, subject);
    default:
      throw new Error('never reached');
  }
}

function substituteLeafExpr(
  expr: Extract<
    Expr,
    { kind: 'call' | 'bin' | 'instanceof' | 'call_checker' }
  >,
  subject: ValueRef,
): Expr {
  switch (expr.kind) {
    case 'call':
      return {
        kind: 'call',
        name: expr.name,
        args: expr.args.map((a) => substituteArg(a, subject)),
      };
    case 'bin':
      return {
        kind: 'bin',
        op: expr.op,
        left: substituteArg(expr.left, subject),
        right: substituteArg(expr.right, subject),
      };
    case 'instanceof':
      return {
        kind: 'instanceof',
        className: expr.className,
        subject: substituteArg(expr.subject, subject),
      };
    case 'call_checker':
      return {
        kind: 'call_checker',
        name: expr.name,
        subject: substituteValueRef(expr.subject, subject),
      };
    default:
      throw new Error('never reached');
  }
}

export function substituteStmt(stmt: Stmt, subject: ValueRef): Stmt {
  switch (stmt.kind) {
    case 'if':
      return {
        kind: 'if',
        cond: substituteExpr(stmt.cond, subject),
        body: substituteBlock(stmt.body, subject),
      };
    case 'foreach':
      return {
        ...stmt,
        iterable: substituteValueRef(stmt.iterable, subject),
        body: substituteBlock(stmt.body, subject),
      };
    case 'return':
      return {
        kind: 'return',
        expr: substituteExpr(stmt.expr, subject),
      };
    default: {
      const exhaustive: never = stmt;
      return exhaustive;
    }
  }
}

export function substituteBlock(block: Block, subject: ValueRef): Block {
  return block.map((stmt) => substituteStmt(stmt, subject));
}

export function substituteProgramBody(
  program: CheckerProgram,
  subject: ValueRef,
): Block {
  return substituteBlock(program.body, subject);
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
      walkValueRef(stmt.iterable);
      walkBlock(stmt.body, names);
      break;
    case 'return':
      walkExpr(stmt.expr, names);
      break;
    default: {
      const exhaustive: never = stmt;
      return exhaustive;
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
        walkArg(a);
      }
      return;
    case 'bin':
      walkArg(expr.left);
      walkArg(expr.right);
      return;
    case 'instanceof':
      walkArg(expr.subject);
      return;
    case 'call_checker':
      names.add(expr.name);
      walkValueRef(expr.subject);
      return;
    default: {
      const exhaustive: never = expr;
      return exhaustive;
    }
  }
}

function walkArg(arg: Arg): void {
  switch (arg.kind) {
    case 'ref':
      walkValueRef(arg.ref);
      break;
    case 'literal':
      break;
    case 'call':
      for (const a of arg.args) {
        walkArg(a);
      }
      break;
    default:
      throw new Error('never reached');
  }
}

function walkValueRef(ref: ValueRef): void {
  switch (ref.kind) {
    case 'parameter':
    case 'variable':
      return;
    case 'array_access':
      walkValueRef(ref.object);
      return;
    case 'property_access':
      walkValueRef(ref.object);
      return;
    default: {
      const exhaustive: never = ref;
      return exhaustive;
    }
  }
}
