import type { Block, Expr, Stmt, ValueRef } from '../ir/types.ts';
import {
  andExpr,
  binExpr,
  boolLit,
  callArg,
  callExpr,
  literalArg,
  notExpr,
  orExpr,
  refArg,
  variableRef,
} from '../ir/index.ts';
import { equals } from '../ir/equals.ts';
import {
  DECIMAL_INT_STRING_PATTERN,
  nonDecimalIntStringExpr,
} from '../decimalIntString.ts';
import {
  type FactEnv,
  withFalseFact,
  withTrueFact,
} from './knownFacts.env.ts';

function matchesFact(expr: Expr, facts: readonly Expr[]): boolean {
  return facts.some((f) => equals(f, expr));
}

export function substituteFacts(expr: Expr, env: FactEnv): Expr {
  if (matchesFact(expr, env.falseFacts)) {
    return boolLit(false);
  }
  if (matchesFact(expr, env.trueFacts)) {
    return boolLit(true);
  }
  return substituteFactsShallow(expr, env);
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
    case 'and': {
      // Left-to-right: reaching a later conjunct means earlier ones were true.
      let changed = false;
      let currentEnv = env;
      const exprs = expr.exprs.map((e) => {
        const next = substituteFacts(e, currentEnv);
        if (next !== e) {
          changed = true;
        }
        currentEnv = withTrueFact(currentEnv, e);
        return next;
      });
      return changed ? { ...expr, exprs } : expr;
    }
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
 *
 * Body blocks are optimized in isolation first, which De Morgan-expands
 * `!(int|…)` before this outer pass — so we also seed those expanded false forms.
 */
function seedForeachArrayKeyFacts(env: FactEnv, key: ValueRef): FactEnv {
  const s = refArg(key);
  const isInt = callExpr('is_int', [s]);
  const isString = callExpr('is_string', [s]);
  const nonDecimal = nonDecimalIntStringExpr(s);
  const pregEq1 = binExpr(
    '===',
    callArg('preg_match', [literalArg(DECIMAL_INT_STRING_PATTERN), s]),
    literalArg('1'),
  );
  const notNonDecimalExpanded = orExpr([notExpr(isString), pregEq1]);

  let next = env;
  for (const fact of [
    orExpr([isInt, isString]),
    orExpr([isString, isInt]),
    orExpr([isInt, nonDecimal]),
    orExpr([nonDecimal, isInt]),
  ]) {
    next = withTrueFact(next, fact);
  }
  for (const fact of [
    andExpr([notExpr(isInt), notExpr(isString)]),
    andExpr([notExpr(isString), notExpr(isInt)]),
    andExpr([notExpr(isInt), notNonDecimalExpanded]),
    andExpr([notNonDecimalExpanded, notExpr(isInt)]),
  ]) {
    next = withFalseFact(next, fact);
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
