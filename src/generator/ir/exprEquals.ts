import type { Arg, Expr, Stmt } from './types.ts';

export function exprEquals(a: Expr, b: Expr): boolean {
  if (a.kind !== b.kind) {
    return false;
  }
  switch (a.kind) {
    case 'bool':
      return b.kind === 'bool' && a.value === b.value;
    case 'not':
      return b.kind === 'not' && exprEquals(a.expr, b.expr);
    case 'and':
      return (
        b.kind === 'and' &&
        a.exprs.length === b.exprs.length &&
        a.exprs.every((e, i) => exprEquals(e, b.exprs[i]!))
      );
    case 'or':
      return (
        b.kind === 'or' &&
        a.exprs.length === b.exprs.length &&
        a.exprs.every((e, i) => exprEquals(e, b.exprs[i]!))
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
        b.kind === 'array_access' && a.base === b.base && a.key === b.key
      );
    case 'property_access':
      return (
        b.kind === 'property_access' && a.base === b.base && a.name === b.name
      );
    default:
      return false;
  }
}

/** `if (not guard) { return false; }` */
export function isFailIfReturnFalse(stmt: Stmt): Expr | null {
  if (stmt.kind !== 'if' || stmt.body.length !== 1) {
    return null;
  }
  const inner = stmt.body[0]!;
  if (
    inner.kind !== 'return' ||
    inner.expr.kind !== 'bool' ||
    inner.expr.value !== false
  ) {
    return null;
  }
  if (stmt.cond.kind !== 'not') {
    return null;
  }
  return stmt.cond.expr;
}

export function failIfFromGuard(guard: Expr): Stmt {
  return {
    kind: 'if',
    cond: { kind: 'not', expr: guard },
    body: [{ kind: 'return', expr: { kind: 'bool', value: false } }],
  };
}
