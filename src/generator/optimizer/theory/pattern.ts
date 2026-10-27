/**
 * Match theory patterns against checker IR.
 */
import type { Arg, Expr, ValueRef } from '../../ir/types.ts';
import { callExpr, refArg } from '../../ir/index.ts';
import { equals } from '../../ir/equals.ts';
import type {
  ArgPattern,
  ExprPattern,
  Subst,
  ValueRefPattern,
} from './pattern.types.ts';

/** Arg equality via a dummy call wrap (IR equals is expr-only). */
function argsEqual(a: Arg, b: Arg): boolean {
  return equals(callExpr('_', [a]), callExpr('_', [b]));
}

export function emptySubst(): Subst {
  return {
    exprs: new Map(),
    args: new Map(),
    literals: new Map(),
    ints: new Map(),
  };
}

function cloneSubst(s: Subst): Subst {
  return {
    exprs: new Map(s.exprs),
    args: new Map(s.args),
    literals: new Map(s.literals),
    ints: new Map(s.ints),
  };
}

function bindExpr(s: Subst, name: string, expr: Expr): Subst | null {
  const prev = s.exprs.get(name);
  if (prev !== undefined) {
    return equals(prev, expr) ? s : null;
  }
  const next = cloneSubst(s);
  next.exprs.set(name, expr);
  return next;
}

function bindArg(s: Subst, name: string, arg: Arg): Subst | null {
  const prev = s.args.get(name);
  if (prev !== undefined) {
    return argsEqual(prev, arg) ? s : null;
  }
  const next = cloneSubst(s);
  next.args.set(name, arg);
  return next;
}

function bindLit(s: Subst, name: string, value: string): Subst | null {
  const prev = s.literals.get(name);
  if (prev !== undefined) {
    return prev === value ? s : null;
  }
  const next = cloneSubst(s);
  next.literals.set(name, value);
  return next;
}

function bindInt(s: Subst, name: string, n: number): Subst | null {
  const prev = s.ints.get(name);
  if (prev !== undefined) {
    return prev === n ? s : null;
  }
  const next = cloneSubst(s);
  next.ints.set(name, n);
  return next;
}

/** Non-negative decimal int literal (`0`, `1`, …), else null. */
export function parseNonNegIntLiteral(value: string): number | null {
  if (!/^[0-9]+$/u.test(value)) {
    return null;
  }
  return Number(value);
}

function matchExprList(
  patterns: readonly ExprPattern[],
  exprs: readonly Expr[],
  subst: Subst,
): Subst | null {
  if (patterns.length !== exprs.length) {
    return null;
  }
  let s = subst;
  for (let i = 0; i < patterns.length; i++) {
    const next = matchExpr(patterns[i], exprs[i], s);
    if (next === null) {
      return null;
    }
    s = next;
  }
  return s;
}

function matchArgList(
  patterns: readonly ArgPattern[],
  args: readonly Arg[],
  subst: Subst,
): Subst | null {
  if (patterns.length !== args.length) {
    return null;
  }
  let s = subst;
  for (let i = 0; i < patterns.length; i++) {
    const next = matchArg(patterns[i], args[i], s);
    if (next === null) {
      return null;
    }
    s = next;
  }
  return s;
}

function matchBin(
  pattern: Extract<ExprPattern, { kind: 'bin' }>,
  expr: Extract<Expr, { kind: 'bin' }>,
  subst: Subst,
): Subst | null {
  if (expr.op !== pattern.op) {
    return null;
  }
  const direct = matchArg(pattern.left, expr.left, subst);
  if (direct !== null) {
    const both = matchArg(pattern.right, expr.right, direct);
    if (both !== null) {
      return both;
    }
  }
  if (pattern.commute === true && (pattern.op === '===' || pattern.op === '!==')) {
    const swapped = matchArg(pattern.left, expr.right, subst);
    if (swapped === null) {
      return null;
    }
    return matchArg(pattern.right, expr.left, swapped);
  }
  return null;
}

function matchValueRef(
  pattern: ValueRefPattern,
  ref: ValueRef,
  subst: Subst,
): Subst | null {
  switch (pattern.kind) {
    case 'any':
      return subst;
    case 'var':
      return bindArg(subst, pattern.name, refArg(ref));
    case 'parameter':
      return ref.kind === 'parameter' ? subst : null;
    case 'variable':
      return ref.kind === 'variable' && ref.id === pattern.id ? subst : null;
    default:
      throw new Error('never reached');
  }
}

export function matchArg(
  pattern: ArgPattern,
  arg: Arg,
  subst: Subst = emptySubst(),
): Subst | null {
  switch (pattern.kind) {
    case 'var':
      return bindArg(subst, pattern.name, arg);
    case 'any':
      return subst;
    case 'lit':
      return arg.kind === 'literal' && arg.value === pattern.value ? subst : null;
    case 'litVar':
      return arg.kind === 'literal' ? bindLit(subst, pattern.name, arg.value) : null;
    case 'intLitVar': {
      if (arg.kind !== 'literal') {
        return null;
      }
      const n = parseNonNegIntLiteral(arg.value);
      return n === null ? null : bindInt(subst, pattern.name, n);
    }
    case 'call':
      return arg.kind === 'call' && arg.name === pattern.name
        ? matchArgList(pattern.args, arg.args, subst)
        : null;
    case 'ref':
      return arg.kind === 'ref'
        ? matchValueRef(pattern.ref, arg.ref, subst)
        : null;
    default:
      throw new Error('never reached');
  }
}

function matchInstanceof(
  pattern: Extract<ExprPattern, { kind: 'instanceof' }>,
  expr: Expr,
  subst: Subst,
): Subst | null {
  if (expr.kind !== 'instanceof') {
    return null;
  }
  if (
    pattern.className !== null &&
    expr.className.toLowerCase() !== pattern.className.toLowerCase()
  ) {
    return null;
  }
  return matchArg(pattern.subject, expr.subject, subst);
}

function matchCallChecker(
  pattern: Extract<ExprPattern, { kind: 'call_checker' }>,
  expr: Expr,
  subst: Subst,
): Subst | null {
  if (expr.kind !== 'call_checker') {
    return null;
  }
  if (pattern.name !== null && expr.name !== pattern.name) {
    return null;
  }
  return matchValueRef(pattern.subject, expr.subject, subst);
}

export function matchExpr(
  pattern: ExprPattern,
  expr: Expr,
  subst: Subst = emptySubst(),
): Subst | null {
  switch (pattern.kind) {
    case 'var':
      return bindExpr(subst, pattern.name, expr);
    case 'any':
      return subst;
    case 'bool':
      return expr.kind === 'bool' && expr.value === pattern.value ? subst : null;
    case 'not':
      return expr.kind === 'not'
        ? matchExpr(pattern.expr, expr.expr, subst)
        : null;
    case 'and':
      return expr.kind === 'and'
        ? matchExprList(pattern.exprs, expr.exprs, subst)
        : null;
    case 'or':
      return expr.kind === 'or'
        ? matchExprList(pattern.exprs, expr.exprs, subst)
        : null;
    case 'call':
      return expr.kind === 'call' && expr.name === pattern.name
        ? matchArgList(pattern.args, expr.args, subst)
        : null;
    case 'bin':
      return expr.kind === 'bin' ? matchBin(pattern, expr, subst) : null;
    case 'instanceof':
      return matchInstanceof(pattern, expr, subst);
    case 'call_checker':
      return matchCallChecker(pattern, expr, subst);
    default:
      throw new Error('never reached');
  }
}
