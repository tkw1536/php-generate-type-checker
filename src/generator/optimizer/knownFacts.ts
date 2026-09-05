import type { Arg, Block, Expr, Stmt, ValueRef } from '../ir/types.ts';
import { boolLit } from '../ir/index.ts';
import { equals } from '../ir/equals.ts';
import {
  type FactEnv,
  withFalseFact,
  withTrueFact,
} from './knownFacts.env.ts';

function valueRefUsesShadowed(
  ref: ValueRef,
  shadowed: ReadonlySet<string>,
): boolean {
  switch (ref.kind) {
    case 'variable':
      return shadowed.has(ref.name);
    case 'array_access':
      return valueRefUsesShadowed(ref.object, shadowed);
    case 'property_access':
      return valueRefUsesShadowed(ref.object, shadowed);
    default:
      throw new Error('never reached');
  }
}

function argUsesShadowed(arg: Arg, shadowed: ReadonlySet<string>): boolean {
  switch (arg.kind) {
    case 'ref':
      return valueRefUsesShadowed(arg.ref, shadowed);
    case 'literal':
      return false;
    case 'call':
      return arg.args.some((a) => argUsesShadowed(a, shadowed));
    default:
      throw new Error('never reached');
  }
}

function exprUsesShadowed(expr: Expr, shadowed: ReadonlySet<string>): boolean {
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
    default:
      throw new Error('never reached');
  }
}

function matchesFact(expr: Expr, facts: readonly Expr[]): boolean {
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
        const next = applyKnownFactsIf(stmt, parameter, currentEnv);
        out.push(next.stmt);
        currentEnv = next.env;
        break;
      }
      case 'foreach':
        out.push(applyKnownFactsForeach(stmt, parameter, currentEnv));
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
  parameter: string,
  env: FactEnv,
): { stmt: Stmt; env: FactEnv } {
  const cond = substituteFacts(stmt.cond, env);
  const bodyEnv = withTrueFact(env, cond);
  const newBody = applyKnownFacts(stmt.body, parameter, bodyEnv);
  return {
    stmt: { kind: 'if', cond, body: newBody },
    env: blockAlwaysExitsWhenEntered(stmt.body)
      ? withFalseFact(env, cond)
      : env,
  };
}

function applyKnownFactsForeach(
  stmt: Extract<Stmt, { kind: 'foreach' }>,
  parameter: string,
  env: FactEnv,
): Stmt {
  const innerShadowed = new Set([
    ...env.shadowed,
    stmt.valueVar,
    ...(stmt.keyVar === null ? [] : [stmt.keyVar]),
  ]);
  const bodyEnv: FactEnv =
    stmt.valueVar === parameter
      ? { trueFacts: [], falseFacts: [], shadowed: innerShadowed }
      : { ...env, shadowed: innerShadowed };
  return {
    ...stmt,
    body: applyKnownFacts(stmt.body, parameter, bodyEnv),
  };
}
