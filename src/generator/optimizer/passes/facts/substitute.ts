import type { Expr } from '../../../ir/types.ts';
import {
  andExpr,
  boolLit,
  notExpr,
  orExpr,
} from '../../../ir/index.ts';
import { equals } from '../../../ir/equals.ts';
import type { OptimizeContext } from '../../context.ts';
import { replaceExpr } from '../../trace/replaceExpr.ts';
import type {
  OptimizeTraceDetail,
  OptimizeTraceFactUse,
} from '../../trace/types.ts';
import { canonicalizeFactExpr } from './canon.ts';
import { type FactEnv, envOrigin, withTrueFact } from './env.ts';
import {
  factsProvingFalse,
  factsProvingTrue,
  impliesModuloFacts,
} from './substitute.prove.ts';

/** Tracks the live form of the top-level expr being substituted for scoped records. */
class HostCursor {
  #current: Expr;

  constructor(expr: Expr) {
    this.#current = expr;
  }

  get current(): Expr {
    return this.#current;
  }

  apply(before: Expr, after: Expr): void {
    this.#current = replaceExpr(this.#current, before, after);
  }
}

function factsDetail(
  used: readonly OptimizeTraceFactUse[],
): Extract<OptimizeTraceDetail, { kind: 'facts' }> {
  if (used.length === 0) {
    throw new Error('facts.* events require at least one used fact');
  }
  return { kind: 'facts', used };
}

function junction(mode: 'and' | 'or', exprs: readonly Expr[]): Expr {
  return mode === 'and' ? andExpr(exprs) : orExpr(exprs);
}

function recordFactExpr(
  ctx: Readonly<OptimizeContext> | undefined,
  host: HostCursor,
  rule: 'facts.proveTrue' | 'facts.proveFalse' | 'facts.absorb',
  before: Expr,
  after: Expr,
  used: readonly OptimizeTraceFactUse[],
): void {
  if (ctx === undefined || equals(before, after)) {
    return;
  }
  if (
    ctx.trace.recordExpr(rule, before, after, factsDetail(used), host.current)
  ) {
    host.apply(before, after);
  }
}

function structuralKeepFact(
  other: Expr,
  env: FactEnv,
): OptimizeTraceFactUse {
  return {
    expr: other,
    known: 'true',
    origin: envOrigin(env),
    reason: 'structural',
  };
}

function shouldDropOperand(
  candidate: Expr,
  other: Expr,
  mode: 'and' | 'or',
  env: FactEnv,
): readonly OptimizeTraceFactUse[] | null {
  if (equals(canonicalizeFactExpr(candidate), canonicalizeFactExpr(other))) {
    return null;
  }
  if (mode === 'or' && impliesModuloFacts(candidate, other, env)) {
    const used = factsProvingTrue(orExpr([notExpr(candidate), other]), env);
    return used.length > 0 ? used : [structuralKeepFact(other, env)];
  }
  if (mode === 'and' && impliesModuloFacts(other, candidate, env)) {
    const used = factsProvingTrue(orExpr([notExpr(other), candidate]), env);
    return used.length > 0 ? used : [structuralKeepFact(other, env)];
  }
  return null;
}

/**
 * Drop redundant operands using implication under `env`:
 * - OR: drop stronger A when A ⇒ B
 * - AND: drop weaker B when A ⇒ B
 *
 * Records the junction rewrite (not operand→operand replace-all).
 */
function absorbOperandsModuloFacts(
  exprs: readonly Expr[],
  mode: 'and' | 'or',
  env: FactEnv,
  ctx: Readonly<OptimizeContext> | undefined,
  host: HostCursor,
): Expr[] {
  const kept: Expr[] = [];
  const usedAll: OptimizeTraceFactUse[] = [];
  for (let i = 0; i < exprs.length; i++) {
    const candidate = exprs[i];
    let drop = false;
    for (let j = 0; j < exprs.length; j++) {
      if (i === j) {
        continue;
      }
      const used = shouldDropOperand(candidate, exprs[j], mode, env);
      if (used !== null) {
        usedAll.push(...used);
        drop = true;
        break;
      }
    }
    if (!drop) {
      kept.push(candidate);
    }
  }
  if (kept.length !== exprs.length) {
    recordFactExpr(
      ctx,
      host,
      'facts.absorb',
      junction(mode, exprs),
      junction(mode, kept),
      usedAll,
    );
  }
  return kept;
}

export function substituteFacts(
  expr: Expr,
  env: FactEnv,
  ctx?: Readonly<OptimizeContext>,
): Expr {
  return substituteFactsInner(expr, env, ctx, new HostCursor(expr));
}

function substituteFactsInner(
  expr: Expr,
  env: FactEnv,
  ctx: Readonly<OptimizeContext> | undefined,
  host: HostCursor,
): Expr {
  if (expr.kind === 'bool') {
    return expr;
  }
  const falseUsed = factsProvingFalse(expr, env);
  if (falseUsed.length > 0) {
    const next = boolLit(false);
    recordFactExpr(ctx, host, 'facts.proveFalse', expr, next, falseUsed);
    return next;
  }
  const trueUsed = factsProvingTrue(expr, env);
  if (trueUsed.length > 0) {
    const next = boolLit(true);
    recordFactExpr(ctx, host, 'facts.proveTrue', expr, next, trueUsed);
    return next;
  }
  return substituteFactsShallow(expr, env, ctx, host);
}

function substituteFactsAnd(
  expr: Extract<Expr, { kind: 'and' }>,
  env: FactEnv,
  ctx: Readonly<OptimizeContext> | undefined,
  host: HostCursor,
): Expr {
  // Left-to-right: reaching a later conjunct means earlier ones were true.
  let changed = false;
  let currentEnv = env;
  let exprs = expr.exprs.map((e) => {
    const next = substituteFactsInner(e, currentEnv, ctx, host);
    if (next !== e) {
      changed = true;
    }
    currentEnv = withTrueFact(currentEnv, e, envOrigin(currentEnv));
    return next;
  });
  const absorbed = absorbOperandsModuloFacts(exprs, 'and', env, ctx, host);
  if (absorbed.length !== exprs.length) {
    changed = true;
    exprs = absorbed;
  }
  return changed ? andExpr(exprs) : expr;
}

function substituteFactsOr(
  expr: Extract<Expr, { kind: 'or' }>,
  env: FactEnv,
  ctx: Readonly<OptimizeContext> | undefined,
  host: HostCursor,
): Expr {
  let changed = false;
  let exprs = expr.exprs.map((e) => {
    const next = substituteFactsInner(e, env, ctx, host);
    if (next !== e) {
      changed = true;
    }
    return next;
  });
  const absorbed = absorbOperandsModuloFacts(exprs, 'or', env, ctx, host);
  if (absorbed.length !== exprs.length) {
    changed = true;
    exprs = absorbed;
  }
  return changed ? orExpr(exprs) : expr;
}

function substituteFactsShallow(
  expr: Expr,
  env: FactEnv,
  ctx: Readonly<OptimizeContext> | undefined,
  host: HostCursor,
): Expr {
  switch (expr.kind) {
    case 'bool':
    case 'call':
    case 'bin':
    case 'instanceof':
    case 'call_checker':
      return expr;
    case 'not': {
      const inner = substituteFactsInner(expr.expr, env, ctx, host);
      if (inner.kind === 'bool') {
        const before: Expr = { kind: 'not', expr: inner };
        const next = boolLit(!inner.value);
        // Keep live IR in sync when !FALSE/!TRUE folds after a prove*.
        if (
          ctx !== undefined &&
          !equals(before, next) &&
          ctx.trace.recordExpr(
            'simplify.normalize.boolFold',
            before,
            next,
            undefined,
            host.current,
          )
        ) {
          host.apply(before, next);
        }
        return next;
      }
      return inner === expr.expr ? expr : { kind: 'not', expr: inner };
    }
    case 'and':
      return substituteFactsAnd(expr, env, ctx, host);
    case 'or':
      return substituteFactsOr(expr, env, ctx, host);
  }
  throw new Error('never reached');
}
