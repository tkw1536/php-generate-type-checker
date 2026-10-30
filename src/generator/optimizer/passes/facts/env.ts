import type { Expr } from '../../../ir/types.ts';
import { equals } from '../../../ir/equals.ts';
import { canonicalizeFactExpr } from './canon.ts';
import { deriveFalseFacts } from './env.deriveFalse.ts';
import { deriveTrueFacts } from './env.deriveTrue.ts';
import type { FactMutators, Flags } from './env.mutators.ts';
import {
  type EnvHow,
  type EnvLeafId,
  type FactEntry,
  type FactEnv,
  type FactOriginId,
  toEnvFact,
} from './env.types.ts';

// Environments are immutable.
// The functions {@link withTrueFact} and {@link withFalseFact} create new environments with new facts.
//
// These functions are mutually recursive to expand the set of facts.
// To prevent infinite recursion, when adding a new fact, these must be careful not increase expression complexity.
// Alternative they may add a flag to skip further expansion.

function hasTrue(env: FactEnv, expr: Expr): boolean {
  return env.trueFacts.some((f) => equals(f.expr, expr));
}

function hasFalse(env: FactEnv, expr: Expr): boolean {
  return env.falseFacts.some((f) => equals(f.expr, expr));
}

function makeHow(
  reason: EnvLeafId,
  origin: FactOriginId,
  premise: FactEntry | null,
  fromKnown: 'true' | 'false',
): EnvHow {
  if (reason === 'assumed') {
    return { kind: 'assumed', origin };
  }
  return {
    kind: 'derive',
    rule: reason,
    premises: premise === null ? [] : [toEnvFact(premise, fromKnown)],
  };
}

const mutators: FactMutators = {
  withTrue: withTrueFact,
  withFalse: withFalseFact,
};

export function withTrueFact(
  env: FactEnv,
  expr: Expr,
  origin: FactOriginId,
  reason: EnvLeafId = 'assumed',
  flags?: Flags,
  from?: FactEntry | null,
  fromKnown: 'true' | 'false' = 'true',
): FactEnv {
  if (expr.kind === 'bool') {
    return env;
  }
  const canon = canonicalizeFactExpr(expr);
  if (hasTrue(env, canon)) {
    return env;
  }
  const premise = from ?? null;
  const how = makeHow(reason, origin, premise, fromKnown);
  const entry: FactEntry = {
    expr: canon,
    origin,
    how,
  };
  const next: FactEnv = {
    ...env,
    trueFacts: [...env.trueFacts, entry],
  };
  return deriveTrueFacts(next, canon, origin, entry, flags, mutators);
}

export function withFalseFact(
  env: FactEnv,
  expr: Expr,
  origin: FactOriginId,
  reason: EnvLeafId = 'assumed',
  flags?: Flags,
  from?: FactEntry | null,
  fromKnown: 'true' | 'false' = 'false',
): FactEnv {
  if (expr.kind === 'bool') {
    return env;
  }
  const canon = canonicalizeFactExpr(expr);
  if (hasFalse(env, canon)) {
    return env;
  }
  const premise = from ?? null;
  const how = makeHow(reason, origin, premise, fromKnown);
  const entry: FactEntry = {
    expr: canon,
    origin,
    how,
  };
  const next: FactEnv = {
    ...env,
    falseFacts: [...env.falseFacts, entry],
  };
  return deriveFalseFacts(next, canon, origin, entry, flags, mutators);
}
