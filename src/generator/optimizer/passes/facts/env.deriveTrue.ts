/**
 * Expand known-true facts: structural env bookkeeping (AND/OR/NOT/commute)
 * plus PHP semantic consequences from the theory prover.
 */
import type { Expr } from '../../../ir/types.ts';
import { andExpr, binExpr, notExpr } from '../../../ir/index.ts';
import { consequencesFromTrue } from '../../theory/consequences.ts';
import type { FactMutators, Flags } from './env.mutators.ts';
import type {
  FactEntry,
  FactEnv,
  FactOriginId,
} from './env.types.ts';
import { isEnvSeededTheoryRule } from './env.types.ts';

/**
 * Seed env with theory consequences that are part of the env reason catalog.
 * Recursive withTrue will continue structural expansion on each add.
 */
function deriveTheoryConsequences(
  env: FactEnv,
  expr: Expr,
  origin: FactOriginId,
  from: FactEntry,
  m: FactMutators,
): FactEnv {
  let next = env;
  for (const c of consequencesFromTrue(expr)) {
    if (!isEnvSeededTheoryRule(c.ruleId)) {
      // Array/list implications stay on-demand via imply; not seeded into env.
      continue;
    }
    next = m.withTrue(
      next,
      c.expr,
      origin,
      c.ruleId,
      undefined,
      from,
      'true',
    );
  }
  return next;
}

function deriveTrueAnd(
  env: FactEnv,
  expr: Extract<Expr, { kind: 'and' }>,
  origin: FactOriginId,
  from: FactEntry,
  m: FactMutators,
): FactEnv {
  let next = env;
  for (const conjunct of expr.exprs) {
    next = m.withTrue(
      next,
      conjunct,
      origin,
      'andSplit',
      undefined,
      from,
      'true',
    );
  }
  return next;
}

function deriveTrueOr(
  env: FactEnv,
  expr: Extract<Expr, { kind: 'or' }>,
  origin: FactOriginId,
  from: FactEntry,
  flags: Flags | undefined,
  m: FactMutators,
): FactEnv {
  if (flags?.skipDeMorgan === true) {
    return env;
  }
  return m.withFalse(
    env,
    andExpr(expr.exprs.map(notExpr)),
    origin,
    'deMorgan',
    { skipDeMorgan: true },
    from,
    'true',
  );
}

function deriveTrueBin(
  env: FactEnv,
  expr: Extract<Expr, { kind: 'bin' }>,
  origin: FactOriginId,
  from: FactEntry,
  m: FactMutators,
): FactEnv {
  const withTheory = deriveTheoryConsequences(env, expr, origin, from, m);
  return m.withTrue(
    withTheory,
    binExpr(expr.op, expr.right, expr.left),
    origin,
    'commute',
    undefined,
    from,
    'true',
  );
}

export function deriveTrueFacts(
  env: FactEnv,
  expr: Expr,
  origin: FactOriginId,
  from: FactEntry,
  flags: Flags | undefined,
  m: FactMutators,
): FactEnv {
  switch (expr.kind) {
    case 'and':
      return deriveTrueAnd(env, expr, origin, from, m);
    case 'bin':
      return deriveTrueBin(env, expr, origin, from, m);
    case 'not':
      return m.withFalse(
        env,
        expr.expr,
        origin,
        'notFlip',
        undefined,
        from,
        'true',
      );
    case 'or':
      return deriveTrueOr(env, expr, origin, from, flags, m);
    case 'instanceof':
    case 'call':
      return deriveTheoryConsequences(env, expr, origin, from, m);
    case 'bool':
    case 'call_checker':
      return env;
    default:
      throw new Error('never reached');
  }
}
