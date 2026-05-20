import type { Arg, Block, Expr, Stmt, ValueRef } from '../ir/types.ts';
import { andExpr, binExpr, boolLit, notExpr, orExpr } from '../ir/index.ts';
import { equals } from '../ir/equals.ts';
import { negateBinOp } from "./expression.ts";

export type FactEnv = {
  trueFacts: Expr[];
  falseFacts: Expr[];
  shadowed: Set<string>;
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
  skipDeMorgan?: true;
}

function withTrueFact(env: FactEnv, expr: Expr, flags?: Flags): FactEnv {
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
        next = withTrueFact(next, binExpr(negateBinOp(expr.op), expr.right, expr.left));
        break;
    case 'not':
      next = withFalseFact(next, expr.expr);
      break;
    case 'or':
      if (!(flags?.skipDeMorgan)) {
        // x || y => !!(x || y) => !(!x && !y)
        next = withFalseFact(next, andExpr(expr.exprs.map(notExpr)), { skipDeMorgan: true });
      }
      break;
    default:
      break;
  }
  return next;
}

function withFalseFact(env: FactEnv, expr: Expr, flags?: Flags): FactEnv {
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
      next = withFalseFact(next, binExpr(negateBinOp(expr.op), expr.right, expr.left));
      break;
    case 'not':
      next = withTrueFact(next, expr.expr);
      break;
    case 'and':
      if (!(flags?.skipDeMorgan)) {
        // !(x && y) => !x || !y
        next = withTrueFact(next, orExpr(expr.exprs.map(notExpr)), { skipDeMorgan: true });
      }
      break;
  }
  return next;
}

function valueRefUsesShadowed(ref: ValueRef, shadowed: Set<string>): boolean {
  switch (ref.kind) {
    case 'variable':
      return shadowed.has(ref.name);
    case 'array_access':
      return valueRefUsesShadowed(ref.object, shadowed);
    case 'property_access':
      return valueRefUsesShadowed(ref.object, shadowed);
    default: {
      const _exhaustive: never = ref;
      return _exhaustive;
    }
  }
}

function argUsesShadowed(arg: Arg, shadowed: Set<string>): boolean {
  switch (arg.kind) {
    case 'ref':
      return valueRefUsesShadowed(arg.ref, shadowed);
    case 'literal':
      return false;
    case 'call':
      return arg.args.some((a) => argUsesShadowed(a, shadowed));
    default: {
      const _exhaustive: never = arg;
      return _exhaustive;
    }
  }
}

function exprUsesShadowed(expr: Expr, shadowed: Set<string>): boolean {
  switch (expr.kind) {
    case 'bool':
      return false;
    case 'not':
      return exprUsesShadowed(expr.expr, shadowed);
    case 'and':
    case 'or':
      return expr.exprs.some((e) => exprUsesShadowed(e, shadowed));
    case 'call':
      return expr.args.some((a) => argUsesShadowed(a, shadowed));
    case 'bin':
      return (
        argUsesShadowed(expr.left, shadowed) ||
        argUsesShadowed(expr.right, shadowed)
      );
    case 'instanceof':
      return argUsesShadowed(expr.subject, shadowed);
    case 'call_checker':
      return valueRefUsesShadowed(expr.subject, shadowed);
    default: {
      const _exhaustive: never = expr;
      return _exhaustive;
    }
  }
}

function matchesFact(expr: Expr, facts: Expr[]): boolean {
  return facts.some((f) => equals(f, expr));
}

export function substituteFacts(expr: Expr, env: FactEnv): Expr {
  if (env.shadowed.size > 0 && exprUsesShadowed(expr, env.shadowed)) {
    return substituteFactsShallow(expr, env, true);
  }
  if (matchesFact(expr, env.falseFacts)) {
    return boolLit(false);
  }
  if (matchesFact(expr, env.trueFacts)) {
    return boolLit(true);
  }
  return substituteFactsShallow(expr, env, false);
}

function substituteFactsShallow(
  expr: Expr,
  env: FactEnv,
  skipLeafReplace: boolean,
): Expr {
  switch (expr.kind) {
    case 'bool':
    case 'call':
    case 'bin':
    case 'instanceof':
    case 'call_checker':
      return expr;
    case 'not': {
      const inner = substituteFacts(expr.expr, env);
      if (!skipLeafReplace && inner.kind === 'bool') {
        return boolLit(!inner.value);
      }
      return inner === expr.expr ? expr : { kind: 'not', expr: inner };
    }
    case 'and':
    case 'or': {
      let changed = false;
      const exprs = expr.exprs.map((e) => {
        const next = substituteFacts(e, env);
        if (next !== e) {
          changed = true;
        }
        return next;
      });
      return changed ? { ...expr, exprs } : expr;
    }
  }
  throw new Error("never reached");
}

/**
 * True when an `if` body (linear IR, no else) always reaches `return` if entered:
 * the last statement must be `return`, so any `if`/`foreach` inside either
 * returns there or falls through to that trailing `return`.
 */
export function blockAlwaysExitsWhenEntered(block: Block): boolean {
  // Note: Checking only the last statement assumes DCE has run.
  // This may not be true this time, but will be eventually.
  return block.length > 0 && block[block.length - 1].kind === 'return';
}

export function applyKnownFacts(
  block: Block,
  parameter: string,
  env: FactEnv,
): Block {
  const out: Stmt[] = [];
  let currentEnv = env;

  for (const stmt of block) {
    switch (stmt.kind) {
      case 'if': {
        const cond = substituteFacts(stmt.cond, currentEnv);
        const bodyEnv = withTrueFact(currentEnv, cond);
        const newBody = applyKnownFacts(stmt.body, parameter, bodyEnv);
        out.push({ kind: 'if', cond, body: newBody });
        if (blockAlwaysExitsWhenEntered(stmt.body)) {
          currentEnv = withFalseFact(currentEnv, cond);
        }
        break;
      }
      case 'foreach': {
        const innerShadowed = new Set(currentEnv.shadowed);
        innerShadowed.add(stmt.valueVar);
        if (stmt.keyVar !== null) {
          innerShadowed.add(stmt.keyVar);
        }
        const bodyEnv: FactEnv = {
          ...currentEnv,
          shadowed: innerShadowed,
        };
        if (stmt.valueVar === parameter) {
          bodyEnv.trueFacts = [];
          bodyEnv.falseFacts = [];
        }
        out.push({
          ...stmt,
          body: applyKnownFacts(stmt.body, parameter, bodyEnv),
        });
        break;
      }
      case 'return':
        out.push({
          kind: 'return',
          expr: substituteFacts(stmt.expr, currentEnv),
        });
        return out;
      default: {
        const _exhaustive: never = stmt;
        out.push(_exhaustive);
      }
    }
  }

  return out;
}
