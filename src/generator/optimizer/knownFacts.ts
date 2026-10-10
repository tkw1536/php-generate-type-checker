import type { Block, Expr, Stmt, ValueRef } from '../ir/types.ts';
import {
  andExpr,
  boolLit,
  callExpr,
  notExpr,
  orExpr,
  refArg,
  variableRef,
} from '../ir/index.ts';
import { equals } from '../ir/equals.ts';
import { nonDecimalIntStringExpr } from '../decimalIntString.ts';
import { canonicalizeFactExpr } from './factCanon.ts';
import { entails, implies } from './implies.ts';
import {
  type FactEnv,
  withFalseFact,
  withTrueFact,
} from './knownFacts.env.ts';

function matchesFact(expr: Expr, facts: readonly Expr[]): boolean {
  return facts.some((f) => equals(f, expr));
}

function factProvesTrue(expr: Expr, env: FactEnv): boolean {
  const canon = canonicalizeFactExpr(expr);
  return (
    matchesFact(canon, env.trueFacts) ||
    env.trueFacts.some((t) => entails(t, canon))
  );
}

function factProvesFalse(expr: Expr, env: FactEnv): boolean {
  const canon = canonicalizeFactExpr(expr);
  if (matchesFact(canon, env.falseFacts)) {
    return true;
  }
  const notCanon = canonicalizeFactExpr(notExpr(canon));
  return env.trueFacts.some((t) => entails(t, notCanon));
}

/** `a ⇒ b` structurally, or because `¬a ∨ b` is known true in `env`. */
function impliesModuloFacts(a: Expr, b: Expr, env: FactEnv): boolean {
  const ca = canonicalizeFactExpr(a);
  const cb = canonicalizeFactExpr(b);
  if (implies(ca, cb)) {
    return true;
  }
  return factProvesTrue(orExpr([notExpr(a), b]), env);
}

/**
 * Drop redundant operands using implication under `env`:
 * - OR: drop stronger A when A ⇒ B
 * - AND: drop weaker B when A ⇒ B
 */
function absorbOperandsModuloFacts(
  exprs: readonly Expr[],
  mode: 'and' | 'or',
  env: FactEnv,
): Expr[] {
  return exprs.filter((candidate, i) => {
    for (let j = 0; j < exprs.length; j++) {
      if (i === j) {
        continue;
      }
      const other = exprs[j];
      if (
        mode === 'or' &&
        impliesModuloFacts(candidate, other, env) &&
        !equals(canonicalizeFactExpr(candidate), canonicalizeFactExpr(other))
      ) {
        return false;
      }
      if (
        mode === 'and' &&
        impliesModuloFacts(other, candidate, env) &&
        !equals(canonicalizeFactExpr(candidate), canonicalizeFactExpr(other))
      ) {
        return false;
      }
    }
    return true;
  });
}

export function substituteFacts(expr: Expr, env: FactEnv): Expr {
  if (factProvesFalse(expr, env)) {
    return boolLit(false);
  }
  if (factProvesTrue(expr, env)) {
    return boolLit(true);
  }
  return substituteFactsShallow(expr, env);
}

function substituteFactsAnd(expr: Extract<Expr, { kind: 'and' }>, env: FactEnv): Expr {
  // Left-to-right: reaching a later conjunct means earlier ones were true.
  let changed = false;
  let currentEnv = env;
  let exprs = expr.exprs.map((e) => {
    const next = substituteFacts(e, currentEnv);
    if (next !== e) {
      changed = true;
    }
    currentEnv = withTrueFact(currentEnv, e);
    return next;
  });
  const absorbed = absorbOperandsModuloFacts(exprs, 'and', env);
  if (absorbed.length !== exprs.length) {
    changed = true;
    exprs = absorbed;
  }
  return changed ? andExpr(exprs) : expr;
}

function substituteFactsOr(expr: Extract<Expr, { kind: 'or' }>, env: FactEnv): Expr {
  let changed = false;
  let exprs = expr.exprs.map((e) => {
    const next = substituteFacts(e, env);
    if (next !== e) {
      changed = true;
    }
    return next;
  });
  const absorbed = absorbOperandsModuloFacts(exprs, 'or', env);
  if (absorbed.length !== exprs.length) {
    changed = true;
    exprs = absorbed;
  }
  return changed ? orExpr(exprs) : expr;
}

function substituteFactsShallow(expr: Expr, env: FactEnv): Expr {
  switch (expr.kind) {
    case 'bool':
    case 'call':
    case 'bin':
    case 'instanceof':
    case 'call_checker':
      return expr;
    case 'not': {
      const inner = substituteFacts(expr.expr, env);
      if (inner.kind === 'bool') {
        return boolLit(!inner.value);
      }
      return inner === expr.expr ? expr : { kind: 'not', expr: inner };
    }
    case 'and':
      return substituteFactsAnd(expr, env);
    case 'or':
      return substituteFactsOr(expr, env);
  }
  throw new Error('never reached');
}

/**
 * True when an `if` body (linear IR, no else) always reaches `return` if entered:
 * the last statement must be `return`, so any `if`/`foreach` inside either
 * returns there or falls through to that trailing `return`.
 */
export function blockAlwaysExitsWhenEntered(block: Block): boolean {
  // Note: Checking only the last statement assumes DCE has run.
  // This may not be true this time, but will be eventually.
  const last = block.at(-1);
  return last !== undefined && last.kind === 'return';
}

export function applyKnownFacts(block: Block, env: FactEnv): Block {
  const out: Stmt[] = [];
  let currentEnv = env;

  for (const stmt of block) {
    switch (stmt.kind) {
      case 'if': {
        const next = applyKnownFactsIf(stmt, currentEnv);
        out.push(next.stmt);
        currentEnv = next.env;
        break;
      }
      case 'foreach':
        out.push(applyKnownFactsForeach(stmt, currentEnv));
        break;
      case 'return':
        out.push({
          kind: 'return',
          expr: substituteFacts(stmt.expr, currentEnv),
        });
        return out;
      default:
        throw new Error('never reached');
    }
  }

  return out;
}

function applyKnownFactsIf(
  stmt: Extract<Stmt, { kind: 'if' }>,
  env: FactEnv,
): { stmt: Stmt; env: FactEnv } {
  const cond = substituteFacts(stmt.cond, env);
  const bodyEnv = withTrueFact(env, cond);
  const newBody = applyKnownFacts(stmt.body, bodyEnv);
  return {
    stmt: { kind: 'if', cond, body: newBody },
    env: blockAlwaysExitsWhenEntered(stmt.body)
      ? withFalseFact(env, cond)
      : env,
  };
}

/**
 * IR `foreach` is only emitted for arrays (parameterized `iterable` is rejected).
 * PHP array keys from foreach are always `int|non-decimal-int-string`.
 */
function seedForeachArrayKeyFacts(env: FactEnv, key: ValueRef): FactEnv {
  const s = refArg(key);
  const isInt = callExpr('is_int', [s]);
  const isString = callExpr('is_string', [s]);
  const nonDecimal = nonDecimalIntStringExpr(s);
  let next = env;
  for (const fact of [
    orExpr([isInt, isString]),
    orExpr([isString, isInt]),
    orExpr([isInt, nonDecimal]),
    orExpr([nonDecimal, isInt]),
  ]) {
    next = withTrueFact(next, fact);
  }
  return next;
}

function applyKnownFactsForeach(
  stmt: Extract<Stmt, { kind: 'foreach' }>,
  env: FactEnv,
): Stmt {
  const bodyEnv =
    stmt.keyVar === null
      ? env
      : seedForeachArrayKeyFacts(env, variableRef(stmt.keyVar));
  return {
    ...stmt,
    body: applyKnownFacts(stmt.body, bodyEnv),
  };
}
