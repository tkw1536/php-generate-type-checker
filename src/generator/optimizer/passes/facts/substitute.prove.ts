import type { Expr } from '../../../ir/types.ts';
import { notExpr, orExpr } from '../../../ir/index.ts';
import { equals } from '../../../ir/equals.ts';
import { entailProof, implyProof } from '../../theory/prove.ts';
import type { ProveProof } from '../../proof/types.ts';
import { canonicalizeFactExpr } from './canon.ts';
import {
  type FactEntry,
  type FactEnv,
  factEntryAsEnvFact,
} from './env.types.ts';

type FactMatch = {
  readonly entry: FactEntry;
  readonly known: 'true' | 'false';
  readonly proof: ProveProof;
};

function pickBest(matches: readonly FactMatch[]): ProveProof | null {
  if (matches.length === 0) {
    return null;
  }
  const equalsMatches = matches.filter((m) => m.proof.kind === 'equals');
  let pool = equalsMatches.length > 0 ? equalsMatches : matches;
  const assumed = pool.filter(
    (m) => m.entry.how.kind === 'assumed' || m.entry.reason === 'assumed',
  );
  if (assumed.length > 0) {
    pool = assumed;
  }
  return pool[0].proof;
}

function canonNote(
  original: Expr,
  canon: Expr,
): ProveProof['canon'] | undefined {
  if (equals(original, canon)) {
    return undefined;
  }
  return { from: original, to: canon };
}

export function proveTrueProof(
  expr: Expr,
  env: FactEnv,
): ProveProof | null {
  const canon = canonicalizeFactExpr(expr);
  const matches: FactMatch[] = [];
  for (const t of env.trueFacts) {
    if (equals(t.expr, canon)) {
      matches.push({
        entry: t,
        known: 'true',
        proof: {
          kind: 'equals',
          fact: factEntryAsEnvFact(t, 'true'),
          conclusion: canon,
          canon: canonNote(expr, canon),
        },
      });
    } else {
      const bridge = entailProof(t.expr, canon);
      if (bridge !== null) {
        matches.push({
          entry: t,
          known: 'true',
          proof: {
            kind: 'entails',
            fact: factEntryAsEnvFact(t, 'true'),
            conclusion: canon,
            bridge,
            canon: canonNote(expr, canon),
          },
        });
      }
    }
  }
  return pickBest(matches);
}

function matchesFalseEquals(
  expr: Expr,
  canon: Expr,
  env: FactEnv,
): FactMatch[] {
  const matches: FactMatch[] = [];
  for (const f of env.falseFacts) {
    if (equals(f.expr, canon)) {
      matches.push({
        entry: f,
        known: 'false',
        proof: {
          kind: 'equals',
          fact: factEntryAsEnvFact(f, 'false'),
          conclusion: canon,
          canon: canonNote(expr, canon),
        },
      });
    }
  }
  return matches;
}

function matchesTrueNot(
  expr: Expr,
  notCanon: Expr,
  env: FactEnv,
): FactMatch[] {
  const matches: FactMatch[] = [];
  for (const t of env.trueFacts) {
    if (equals(t.expr, notCanon)) {
      matches.push({
        entry: t,
        known: 'true',
        proof: {
          kind: 'equals',
          fact: factEntryAsEnvFact(t, 'true'),
          conclusion: notCanon,
          canon: canonNote(notExpr(expr), notCanon),
        },
      });
      continue;
    }
    const bridge = entailProof(t.expr, notCanon);
    if (bridge !== null) {
      matches.push({
        entry: t,
        known: 'true',
        proof: {
          kind: 'entails',
          fact: factEntryAsEnvFact(t, 'true'),
          conclusion: notCanon,
          bridge,
          canon: canonNote(notExpr(expr), notCanon),
        },
      });
    }
  }
  return matches;
}

export function proveFalseProof(
  expr: Expr,
  env: FactEnv,
): ProveProof | null {
  const canon = canonicalizeFactExpr(expr);
  const notCanon = canonicalizeFactExpr(notExpr(canon));
  return pickBest([
    ...matchesFalseEquals(expr, canon, env),
    ...matchesTrueNot(expr, notCanon, env),
  ]);
}

/**
 * `a ⇒ b` structurally, or because `¬a ∨ b` is known true in `env`.
 * Returns a ProveProof when modulo facts, or uses implyProof for structural.
 */
export function impliesModuloFactsProof(
  a: Expr,
  b: Expr,
  env: FactEnv,
):
  | { readonly kind: 'structural'; readonly imply: NonNullable<ReturnType<typeof implyProof>> }
  | { readonly kind: 'moduloFacts'; readonly prove: ProveProof }
  | null {
  const structural = implyProof(a, b);
  if (structural !== null) {
    return { kind: 'structural', imply: structural };
  }
  const prove = proveTrueProof(orExpr([notExpr(a), b]), env);
  if (prove !== null) {
    return { kind: 'moduloFacts', prove };
  }
  return null;
}
