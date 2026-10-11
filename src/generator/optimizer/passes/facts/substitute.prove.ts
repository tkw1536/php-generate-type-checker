import type { Expr } from '../../../ir/types.ts';
import { notExpr, orExpr } from '../../../ir/index.ts';
import { equals } from '../../../ir/equals.ts';
import { entails, implies } from '../../lib/implies.ts';
import type { OptimizeTraceFactUse } from '../../trace/types.ts';
import { canonicalizeFactExpr } from './canon.ts';
import type { FactEntry, FactEnv } from './env.ts';

type FactMatch = {
  readonly entry: FactEntry;
  readonly how: 'equals' | 'entails';
  readonly known: 'true' | 'false';
};

function toFactUse(m: FactMatch): OptimizeTraceFactUse {
  return {
    expr: m.entry.expr,
    known: m.known,
    origin: m.entry.origin,
    reason: m.entry.reason,
  };
}

/**
 * Prefer equals over entails, then assumed over derived implications.
 * Drops noisy entailing siblings once a tighter match exists.
 */
function pickJustifying(matches: readonly FactMatch[]): OptimizeTraceFactUse[] {
  if (matches.length === 0) {
    return [];
  }
  const equalsMatches = matches.filter((m) => m.how === 'equals');
  let pool = equalsMatches.length > 0 ? equalsMatches : matches;
  const assumed = pool.filter((m) => m.entry.reason === 'assumed');
  if (assumed.length > 0) {
    pool = assumed;
  }
  return pool.map((m) => toFactUse(m));
}

export function factsProvingTrue(
  expr: Expr,
  env: FactEnv,
): OptimizeTraceFactUse[] {
  const canon = canonicalizeFactExpr(expr);
  const matches: FactMatch[] = [];
  for (const t of env.trueFacts) {
    if (equals(t.expr, canon)) {
      matches.push({ entry: t, how: 'equals', known: 'true' });
    } else if (entails(t.expr, canon)) {
      matches.push({ entry: t, how: 'entails', known: 'true' });
    }
  }
  return pickJustifying(matches);
}

export function factsProvingFalse(
  expr: Expr,
  env: FactEnv,
): OptimizeTraceFactUse[] {
  const canon = canonicalizeFactExpr(expr);
  const matches: FactMatch[] = [];
  for (const f of env.falseFacts) {
    if (equals(f.expr, canon)) {
      matches.push({ entry: f, how: 'equals', known: 'false' });
    }
  }
  const notCanon = canonicalizeFactExpr(notExpr(canon));
  for (const t of env.trueFacts) {
    if (equals(t.expr, notCanon)) {
      matches.push({ entry: t, how: 'equals', known: 'true' });
    } else if (entails(t.expr, notCanon)) {
      matches.push({ entry: t, how: 'entails', known: 'true' });
    }
  }
  return pickJustifying(matches);
}

/** `a ⇒ b` structurally, or because `¬a ∨ b` is known true in `env`. */
export function impliesModuloFacts(a: Expr, b: Expr, env: FactEnv): boolean {
  const ca = canonicalizeFactExpr(a);
  const cb = canonicalizeFactExpr(b);
  if (implies(ca, cb)) {
    return true;
  }
  return factsProvingTrue(orExpr([notExpr(a), b]), env).length > 0;
}
