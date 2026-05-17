import type { Arg, Block, Expr, Stmt } from './types.ts';

export function equals(a: Expr, b: Expr): boolean {
  if (a.kind !== b.kind) {
    return false;
  }
  switch (a.kind) {
    case 'bool':
      return b.kind === 'bool' && a.value === b.value;
    case 'not':
      return b.kind === 'not' && equals(a.expr, b.expr);
    case 'and':
      return (
        b.kind === 'and' &&
        a.exprs.length === b.exprs.length &&
        a.exprs.every((e, i) => equals(e, b.exprs[i]!))
      );
    case 'or':
      return (
        b.kind === 'or' &&
        a.exprs.length === b.exprs.length &&
        a.exprs.every((e, i) => equals(e, b.exprs[i]!))
      );
    case 'call':
      return (
        b.kind === 'call' &&
        a.name === b.name &&
        argsEqual(a.args, b.args)
      );
    case 'bin':
      return (
        b.kind === 'bin' &&
        a.op === b.op &&
        argEquals(a.left, b.left) &&
        argEquals(a.right, b.right)
      );
    case 'instanceof':
      return (
        b.kind === 'instanceof' &&
        a.className === b.className &&
        argEquals(a.subject, b.subject)
      );
    case 'call_checker':
      return (
        b.kind === 'call_checker' &&
        a.name === b.name &&
        valueRefEquals(a.subject, b.subject)
      );
    default:
      return false;
  }
}

function argsEqual(a: Arg[], b: Arg[]): boolean {
  if (a.length !== b.length) {
    return false;
  }
  return a.every((arg, i) => argEquals(arg, b[i]!));
}

function argEquals(a: Arg, b: Arg): boolean {
  if (a.kind !== b.kind) {
    return false;
  }
  switch (a.kind) {
    case 'ref':
      return b.kind === 'ref' && valueRefEquals(a.ref, b.ref);
    case 'literal':
      return b.kind === 'literal' && a.value === b.value;
    case 'call':
      return (
        b.kind === 'call' && a.name === b.name && argsEqual(a.args, b.args)
      );
    default:
      return false;
  }
}

function valueRefEquals(
  a: import('./types.ts').ValueRef,
  b: import('./types.ts').ValueRef,
): boolean {
  if (a.kind !== b.kind) {
    return false;
  }
  switch (a.kind) {
    case 'variable':
      return b.kind === 'variable' && a.name === b.name;
    case 'array_access':
      return (
        b.kind === 'array_access' &&
        valueRefEquals(a.object, b.object) &&
        a.key === b.key
      );
    case 'property_access':
      return (
        b.kind === 'property_access' &&
        valueRefEquals(a.object, b.object) &&
        a.name === b.name
      );
    default:
      return false;
  }
}

export function blockEquals(a: Block, b: Block): boolean {
  if (a.length !== b.length) {
    return false;
  }
  return a.every((stmt, i) => stmtEquals(stmt, b[i]!));
}

export function stmtEquals(a: Stmt, b: Stmt): boolean {
  if (a.kind !== b.kind) {
    return false;
  }
  switch (a.kind) {
    case 'if':
      return (
        b.kind === 'if' &&
        equals(a.cond, b.cond) &&
        blockEquals(a.body, b.body)
      );
    case 'foreach':
      return (
        b.kind === 'foreach' &&
        valueRefEquals(a.iterable, b.iterable) &&
        a.keyVar === b.keyVar &&
        a.valueVar === b.valueVar &&
        blockEquals(a.body, b.body)
      );
    case 'return':
      return b.kind === 'return' && equals(a.expr, b.expr);
    default:
      return false;
  }
}
