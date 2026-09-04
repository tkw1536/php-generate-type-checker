import type { Expr } from '../ir/types.ts';
import {
  andExpr,
  binExpr,
  callExpr,
  notExpr,
  orExpr,
} from '../ir/index.ts';
import { equals } from '../ir/equals.ts';
import { negateBinOp } from './expression.ts';

export type FactEnv = {
  readonly trueFacts: readonly Expr[];
  readonly falseFacts: readonly Expr[];
  readonly shadowed: ReadonlySet<string>;
};

export function emptyFactEnv(): FactEnv {
  return { trueFacts: [], falseFacts: [], shadowed: new Set() };
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
  let next = env;
  if (next.trueFacts.some((f) => equals(f, expr))) {
    return next;
  }

  // add derived facts.
  next = { ...next, trueFacts: [...next.trueFacts, expr] };
  switch (expr.kind) {
    case 'and':
      for (const conjunct of expr.exprs) {
        next = withTrueFact(next, conjunct);
      }
      break;
    case 'bin':
      next = withTrueFact(
        next,
        binExpr(negateBinOp(expr.op), expr.right, expr.left),
      );
      break;
    case 'not':
      next = withFalseFact(next, expr.expr);
      break;
    case 'or':
      if (flags?.skipDeMorgan !== true) {
        // x || y => !!(x || y) => !(!x && !y)
        next = withFalseFact(next, andExpr(expr.exprs.map(notExpr)), {
          skipDeMorgan: true,
        });
      }
      break;
    case 'instanceof':
      // `$x instanceof T` implies `is_object($x)`.
      next = withTrueFact(next, callExpr('is_object', [expr.subject]));
      break;
    case 'bool':
    case 'call':
    case 'call_checker':
      break;
    default:
      throw new Error('never reached');
  }
  return next;
}

export function withFalseFact(
  env: FactEnv,
  expr: Expr,
  flags?: Flags,
): FactEnv {
  let next = env;
  // if we already added this fact, then we're done.
  if (next.falseFacts.some((f) => equals(f, expr))) {
    return next;
  }

  // add derived facts.
  next = { ...next, falseFacts: [...next.falseFacts, expr] };
  switch (expr.kind) {
    case 'or':
      for (const disjunct of expr.exprs) {
        next = withFalseFact(next, disjunct);
      }
      break;
    case 'bin':
      next = withFalseFact(
        next,
        binExpr(negateBinOp(expr.op), expr.right, expr.left),
      );
      break;
    case 'not':
      next = withTrueFact(next, expr.expr);
      break;
    case 'and':
      if (flags?.skipDeMorgan !== true) {
        // !(x && y) => !x || !y
        next = withTrueFact(next, orExpr(expr.exprs.map(notExpr)), {
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
