import type { Expr } from '../../../ir/types.ts';
import {
  andExpr,
  boolLit,
  notExpr,
  orExpr,
} from '../../../ir/index.ts';
import { equals } from '../../../ir/equals.ts';
import type { OptimizeContext } from '../../context.ts';
import { entails, implies } from '../../lib/implies.ts';
import type { OptimizeTraceFactUse } from '../../trace/types.ts';
import { canonicalizeFactExpr } from './canon.ts';
import {
  type FactEnv,
  withTrueFact,
} from './env.ts';

function factsProvingTrue(expr: Expr, env: FactEnv): OptimizeTraceFactUse[] {
  const canon = canonicalizeFactExpr(expr);
  const used: OptimizeTraceFactUse[] = [];
  for (const t of env.trueFacts) {
    if (equals(t, canon) || entails(t, canon)) {
      used.push({ expr: t, known: 'true' });
    }
  }
  return used;
}

function factsProvingFalse(expr: Expr, env: FactEnv): OptimizeTraceFactUse[] {
  const canon = canonicalizeFactExpr(expr);
  const used: OptimizeTraceFactUse[] = [];
  for (const f of env.falseFacts) {
    if (equals(f, canon)) {
      used.push({ expr: f, known: 'false' });
    }
  }
  const notCanon = canonicalizeFactExpr(notExpr(canon));
  for (const t of env.trueFacts) {
    if (entails(t, notCanon)) {
      used.push({ expr: t, known: 'true' });
    }
  }
  return used;
}

/** `a ⇒ b` structurally, or because `¬a ∨ b` is known true in `env`. */
function impliesModuloFacts(a: Expr, b: Expr, env: FactEnv): boolean {
  const ca = canonicalizeFactExpr(a);
  const cb = canonicalizeFactExpr(b);
  if (implies(ca, cb)) {
    return true;
  }
  return factsProvingTrue(orExpr([notExpr(a), b]), env).length > 0;
}

function absorbFactDetail(
  used: readonly OptimizeTraceFactUse[],
  other: Expr,
): { readonly kind: 'facts'; readonly used: readonly OptimizeTraceFactUse[] } {
  return {
    kind: 'facts',
    used:
      used.length > 0
        ? used
        : [{ expr: other, known: 'true' }],
  };
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
  ctx?: Readonly<OptimizeContext>,
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
        const used = factsProvingTrue(orExpr([notExpr(candidate), other]), env);
        ctx?.trace.recordExpr(
          'facts.absorb',
          candidate,
          other,
          absorbFactDetail(used, other),
        );
        return false;
      }
      if (
        mode === 'and' &&
        impliesModuloFacts(other, candidate, env) &&
        !equals(canonicalizeFactExpr(candidate), canonicalizeFactExpr(other))
      ) {
        const used = factsProvingTrue(orExpr([notExpr(other), candidate]), env);
        ctx?.trace.recordExpr(
          'facts.absorb',
          candidate,
          other,
          absorbFactDetail(used, other),
        );
        return false;
      }
    }
    return true;
  });
}

export function substituteFacts(
  expr: Expr,
  env: FactEnv,
  ctx?: Readonly<OptimizeContext>,
): Expr {
  const falseUsed = factsProvingFalse(expr, env);
  if (falseUsed.length > 0) {
    const next = boolLit(false);
    ctx?.trace.recordExpr('facts.proveFalse', expr, next, {
      kind: 'facts',
      used: falseUsed,
    });
    return next;
  }
  const trueUsed = factsProvingTrue(expr, env);
  if (trueUsed.length > 0) {
    const next = boolLit(true);
    ctx?.trace.recordExpr('facts.proveTrue', expr, next, {
      kind: 'facts',
      used: trueUsed,
    });
    return next;
  }
  return substituteFactsShallow(expr, env, ctx);
}

function substituteFactsAnd(
  expr: Extract<Expr, { kind: 'and' }>,
  env: FactEnv,
  ctx?: Readonly<OptimizeContext>,
): Expr {
  // Left-to-right: reaching a later conjunct means earlier ones were true.
  let changed = false;
  let currentEnv = env;
  let exprs = expr.exprs.map((e) => {
    const next = substituteFacts(e, currentEnv, ctx);
    if (next !== e) {
      changed = true;
    }
    currentEnv = withTrueFact(currentEnv, e);
    return next;
  });
  const absorbed = absorbOperandsModuloFacts(exprs, 'and', env, ctx);
  if (absorbed.length !== exprs.length) {
    changed = true;
    exprs = absorbed;
  }
  return changed ? andExpr(exprs) : expr;
}

function substituteFactsOr(
  expr: Extract<Expr, { kind: 'or' }>,
  env: FactEnv,
  ctx?: Readonly<OptimizeContext>,
): Expr {
  let changed = false;
  let exprs = expr.exprs.map((e) => {
    const next = substituteFacts(e, env, ctx);
    if (next !== e) {
      changed = true;
    }
    return next;
  });
  const absorbed = absorbOperandsModuloFacts(exprs, 'or', env, ctx);
  if (absorbed.length !== exprs.length) {
    changed = true;
    exprs = absorbed;
  }
  return changed ? orExpr(exprs) : expr;
}

function substituteFactsShallow(
  expr: Expr,
  env: FactEnv,
  ctx?: Readonly<OptimizeContext>,
): Expr {
  switch (expr.kind) {
    case 'bool':
    case 'call':
    case 'bin':
    case 'instanceof':
    case 'call_checker':
      return expr;
    case 'not': {
      const inner = substituteFacts(expr.expr, env, ctx);
      if (inner.kind === 'bool') {
        return boolLit(!inner.value);
      }
      return inner === expr.expr ? expr : { kind: 'not', expr: inner };
    }
    case 'and':
      return substituteFactsAnd(expr, env, ctx);
    case 'or':
      return substituteFactsOr(expr, env, ctx);
  }
  throw new Error('never reached');
}
