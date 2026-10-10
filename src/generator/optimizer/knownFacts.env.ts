import type { Expr } from '../ir/types.ts';
import {
  andExpr,
  binExpr,
  callExpr,
  notExpr,
  orExpr,
} from '../ir/index.ts';
import { equals } from '../ir/equals.ts';
import { canonicalizeFactExpr } from './factCanon.ts';
import { isAAllowStringSubject } from './implies.ts';
import { negateBinOp } from './binOps.ts';

export type FactEnv = {
  readonly trueFacts: readonly Expr[];
  readonly falseFacts: readonly Expr[];
};

export function emptyFactEnv(): FactEnv {
  return { trueFacts: [], falseFacts: [] };
}

// Environments are immutable.
// The functions {@link withTrueFact} and {@link withFalseFact} create new environments with new facts.
//
// These functions are mutually recursive to expand the set of facts.
// To prevent infinite recursion, when adding a new fact, these must be careful not increase expression complexity.
// Alternative they may add a flag to skip further expansion.

type Flags = {
  readonly skipDeMorgan?: true;
};

export function withTrueFact(env: FactEnv, expr: Expr, flags?: Flags): FactEnv {
  const canon = canonicalizeFactExpr(expr);
  let next = env;
  if (next.trueFacts.some((f) => equals(f, canon))) {
    return next;
  }

  next = { ...next, trueFacts: [...next.trueFacts, canon] };
  return deriveTrueFacts(next, canon, flags);
}

function deriveTrueCallFacts(
  env: FactEnv,
  expr: Extract<Expr, { kind: 'call' }>,
): FactEnv {
  let next = env;
  const subject = isAAllowStringSubject(expr);
  if (subject !== null) {
    // `is_a($x, T::class, TRUE)` implies `class_exists($x)`.
    next = withTrueFact(next, callExpr('class_exists', [subject]));
  }
  // is_int / is_string are mutually exclusive on the same value.
  if (expr.name === 'is_int' && expr.args.length === 1) {
    next = withTrueFact(next, notExpr(callExpr('is_string', [expr.args[0]])));
  } else if (expr.name === 'is_string' && expr.args.length === 1) {
    next = withTrueFact(next, notExpr(callExpr('is_int', [expr.args[0]])));
  }
  return next;
}

function deriveTrueFacts(env: FactEnv, expr: Expr, flags?: Flags): FactEnv {
  let next = env;
  switch (expr.kind) {
    case 'and':
      for (const conjunct of expr.exprs) {
        next = withTrueFact(next, conjunct);
      }
      return next;
    case 'bin':
      return withTrueFact(
        next,
        binExpr(negateBinOp(expr.op), expr.right, expr.left),
      );
    case 'not':
      return withFalseFact(next, expr.expr);
    case 'or':
      if (flags?.skipDeMorgan !== true) {
        // x || y => !!(x || y) => !(!x && !y)
        return withFalseFact(next, andExpr(expr.exprs.map(notExpr)), {
          skipDeMorgan: true,
        });
      }
      return next;
    case 'instanceof':
      // `$x instanceof T` implies `is_object($x)`.
      return withTrueFact(next, callExpr('is_object', [expr.subject]));
    case 'call':
      return deriveTrueCallFacts(next, expr);
    case 'bool':
    case 'call_checker':
      return next;
    default:
      throw new Error('never reached');
  }
}

export function withFalseFact(
  env: FactEnv,
  expr: Expr,
  flags?: Flags,
): FactEnv {
  const canon = canonicalizeFactExpr(expr);
  let next = env;
  // if we already added this fact, then we're done.
  if (next.falseFacts.some((f) => equals(f, canon))) {
    return next;
  }

  // add derived facts.
  next = { ...next, falseFacts: [...next.falseFacts, canon] };
  switch (canon.kind) {
    case 'or':
      for (const disjunct of canon.exprs) {
        next = withFalseFact(next, disjunct);
      }
      break;
    case 'bin':
      next = withFalseFact(
        next,
        binExpr(negateBinOp(canon.op), canon.right, canon.left),
      );
      break;
    case 'not':
      next = withTrueFact(next, canon.expr);
      break;
    case 'and':
      if (flags?.skipDeMorgan !== true) {
        // !(x && y) => !x || !y
        next = withTrueFact(next, orExpr(canon.exprs.map(notExpr)), {
          skipDeMorgan: true,
        });
      }
      break;
    case 'bool':
    case 'call':
    case 'call_checker':
    case 'instanceof':
      break;
    default:
      throw new Error('never reached');
  }
  return next;
}
