/**
 * Apply pattern rewrite rules under a fact env.
 * `require` patterns are satisfied by matching a known-true env fact
 * (binding more vars) or, when fully instantiable, by proveTrue.
 */
import type { Expr } from '../../ir/types.ts';
import { boolLit } from '../../ir/index.ts';
import { equals } from '../../ir/equals.ts';
import type { OptimizeContext } from '../context.ts';
import { proveProofToChildren } from '../proof/toTrace.ts';
import type { ProveProof } from '../proof/types.ts';
import { commitReason } from '../trace/commit.ts';
import { exprRewrite } from '../trace/rewrite.ts';
import type { TracePos } from '../trace/types.ts';
import {
  factEntryAsEnvFact,
  type FactEnv,
} from '../passes/facts/env.types.ts';
import type { HostCursor } from '../passes/facts/substitute.absorb.ts';
import { proveTrueProof } from '../passes/facts/substitute.prove.ts';
import { emptySubst, matchExpr } from './pattern.ts';
import { instantiateExpr } from './pattern.instantiate.ts';
import type { ExprPattern, Subst } from './pattern.types.ts';
import { REWRITE_RULES } from './rewrites/index.ts';
import type { RewriteRule } from './types.ts';

type ReqProof = { readonly expr: Expr; readonly proof: ProveProof };

function tryInstantiate(pattern: ExprPattern, subst: Subst): Expr | null {
  try {
    return instantiateExpr(pattern, subst);
  } catch {
    return null;
  }
}

function satisfyRequire(
  pattern: ExprPattern,
  subst: Subst,
  env: FactEnv,
): { readonly subst: Subst; readonly proof: ReqProof } | null {
  for (const fact of env.trueFacts) {
    const next = matchExpr(pattern, fact.expr, subst);
    if (next === null) {
      continue;
    }
    return {
      subst: next,
      proof: {
        expr: fact.expr,
        proof: {
          kind: 'equals',
          fact: factEntryAsEnvFact(fact, 'true'),
          conclusion: fact.expr,
        },
      },
    };
  }
  const instantiated = tryInstantiate(pattern, subst);
  if (instantiated === null) {
    return null;
  }
  const proof = proveTrueProof(instantiated, env);
  if (proof === null) {
    return null;
  }
  return { subst, proof: { expr: instantiated, proof } };
}

function satisfyAllRequires(
  require: readonly ExprPattern[],
  subst: Subst,
  env: FactEnv,
): { readonly subst: Subst; readonly proofs: readonly ReqProof[] } | null {
  let s = subst;
  const proofs: ReqProof[] = [];
  for (const pattern of require) {
    const hit = satisfyRequire(pattern, s, env);
    if (hit === null) {
      return null;
    }
    s = hit.subst;
    proofs.push(hit.proof);
  }
  return { subst: s, proofs };
}

/**
 * Try each rewrite rule against `expr`. First match with satisfied requires wins.
 */
export function applyFactRewrites(
  expr: Expr,
  env: FactEnv,
  ctx: Readonly<OptimizeContext> | undefined,
  pos: TracePos,
  host: HostCursor,
  rules: readonly RewriteRule[] = REWRITE_RULES,
): { readonly expr: Expr; readonly pos: TracePos } | null {
  for (const rule of rules) {
    const matched = matchExpr(rule.match, expr, emptySubst());
    if (matched === null) {
      continue;
    }
    const required = satisfyAllRequires(rule.require ?? [], matched, env);
    if (required === null) {
      continue;
    }
    if (rule.guard !== undefined && !rule.guard(required.subst)) {
      continue;
    }
    const after = instantiateExpr(rule.replace, required.subst);
    if (equals(expr, after)) {
      continue;
    }
    if (ctx === undefined) {
      return { expr: after, pos };
    }
    const children = required.proofs.flatMap(({ expr: req, proof }) =>
      proveProofToChildren(req, boolLit(true), proof),
    );
    const rewrite = exprRewrite(rule.id, expr, after, children);
    const nextPos = commitReason(ctx, pos, rewrite.reason, host.current);
    host.apply(expr, after);
    return { expr: after, pos: nextPos };
  }
  return null;
}
