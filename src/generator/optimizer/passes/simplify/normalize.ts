import type { Expr } from '../../../ir/types.ts';
import { equals } from '../../../ir/equals.ts';
import { andExpr, boolLit, notExpr, orExpr } from '../../../ir/index.ts';
import type { OptimizeContext } from '../../context.ts';
import { absorbImpliedOperands } from '../../lib/implies.ts';
import type { OptimizeTraceRuleId } from '../../trace/types.ts';
import { sortOperands } from './normalize.order.ts';
import {
  dedupeOperands,
  factorAndOfOrs,
  factorOrOfAnds,
  flattenAnd,
  flattenOr,
  hasContradiction,
  hasTautology,
} from './normalize.helpers.ts';

export function normalizeExpr(expr: Expr, ctx?: Readonly<OptimizeContext>): Expr {
  switch (expr.kind) {
    case 'not':
      return normalizeNot(expr, ctx);
    case 'and':
      return normalizeAnd(expr, ctx);
    case 'or':
      return normalizeOr(expr, ctx);
    case 'bin':
    case 'bool':
    case 'call':
    case 'call_checker':
    case 'instanceof':
      return expr;
    default:
      throw new Error('never reached');
  }
}

/**
 * Record a rewrite against `before`, falling back to `live` when the
 * reconstructed `before` is not present in the live IR (e.g. flat junction
 * vs nested and/or). Returns the updated live expr when a record applies.
 */
function record(
  ctx: Readonly<OptimizeContext> | undefined,
  rule: OptimizeTraceRuleId,
  before: Expr,
  after: Expr,
  live: Expr,
): Expr {
  if (ctx === undefined || equals(before, after)) {
    return live;
  }
  if (ctx.trace.recordExpr(rule, before, after)) {
    return after;
  }
  if (!equals(live, before) && ctx.trace.recordExpr(rule, live, after)) {
    return after;
  }
  return live;
}

/**
 * Normalize without tracing. Used when a parent rule will record one event for
 * the whole collapse (temps like !!a from De Morgan are not in the live IR).
 */
function normalizeQuiet(expr: Expr): Expr {
  return normalizeExpr(expr);
}

function normalizeNot(
  expr: Extract<Expr, { kind: 'not' }>,
  ctx?: Readonly<OptimizeContext>,
): Expr {
  const inner = normalizeExpr(expr.expr, ctx);
  const before: Expr = { kind: 'not', expr: inner };
  if (inner.kind === 'bool') {
    const next = boolLit(!inner.value);
    record(ctx, 'simplify.normalize.boolFold', before, next, expr);
    return next;
  }
  if (inner.kind === 'not') {
    // Collapse !!x → normalize(x) as one event (no nested trace on the inner).
    const next = normalizeQuiet(inner.expr);
    record(ctx, 'simplify.normalize.doubleNeg', before, next, expr);
    return next;
  }
  if (inner.kind === 'and') {
    // One event for !(!a && !b) → normalize(a ∨ b), including nested cleanup.
    const next = normalizeQuiet(orExpr(inner.exprs.map((e) => notExpr(e))));
    record(ctx, 'simplify.normalize.deMorgan', before, next, expr);
    return next;
  }
  if (inner.kind === 'or') {
    // One event for !(!a || !b) → normalize(a ∧ b), including nested cleanup.
    const next = normalizeQuiet(andExpr(inner.exprs.map((e) => notExpr(e))));
    record(ctx, 'simplify.normalize.deMorgan', before, next, expr);
    return next;
  }
  return before;
}

function junctionFrom(
  mode: 'and' | 'or',
  flat: readonly Expr[],
): Expr {
  const empty = mode === 'and' ? boolLit(true) : boolLit(false);
  if (flat.length === 0) {
    return empty;
  }
  if (flat.length === 1) {
    return flat[0];
  }
  return mode === 'and' ? andExpr(flat) : orExpr(flat);
}

function absorbAndDedupe(
  mode: 'and' | 'or',
  flatIn: readonly Expr[],
  ctx: Readonly<OptimizeContext> | undefined,
  live: Expr,
): { readonly flat: Expr[]; readonly live: Expr } {
  let flat = [...flatIn];
  let nextLive = live;
  const beforeAbsorb = flat;
  flat = absorbImpliedOperands(flat, mode);
  if (flat.length !== beforeAbsorb.length) {
    nextLive = record(
      ctx,
      'simplify.normalize.absorb',
      junctionFrom(mode, beforeAbsorb),
      junctionFrom(mode, flat),
      nextLive,
    );
  }
  const beforeDedupe = flat;
  flat = sortOperands(dedupeOperands(flat));
  if (flat.length !== beforeDedupe.length) {
    nextLive = record(
      ctx,
      'simplify.normalize.dedupe',
      junctionFrom(mode, beforeDedupe),
      junctionFrom(mode, flat),
      nextLive,
    );
  }
  return { flat, live: nextLive };
}

/** Drop AND true / OR false units; may fold to a bool literal. */
function dropIdentityUnits(
  mode: 'and' | 'or',
  flat: readonly Expr[],
  ctx: Readonly<OptimizeContext> | undefined,
  live: Expr,
): { readonly flat: Expr[]; readonly live: Expr; readonly done?: Expr } {
  const dropTrue = mode === 'and';
  const without = flat.filter((e) =>
    dropTrue ? !(e.kind === 'bool' && e.value) : !(e.kind === 'bool' && !e.value),
  );
  if (without.length === flat.length) {
    return { flat: [...flat], live };
  }
  if (without.length === 0) {
    const next = boolLit(dropTrue);
    record(ctx, 'simplify.normalize.boolFold', junctionFrom(mode, flat), next, live);
    return { flat: [], live, done: next };
  }
  const next = junctionFrom(mode, without);
  const nextLive = record(
    ctx,
    'simplify.normalize.identity',
    junctionFrom(mode, flat),
    next,
    live,
  );
  return { flat: [...without], live: nextLive };
}

function finishJunction(
  mode: 'and' | 'or',
  flatIn: readonly Expr[],
  ctx: Readonly<OptimizeContext> | undefined,
  liveIn: Expr,
): Expr {
  const absorbed = absorbAndDedupe(mode, flatIn, ctx, liveIn);
  let flat = absorbed.flat;
  let live = absorbed.live;
  const contradictory =
    mode === 'and' ? hasContradiction(flat) : hasTautology(flat);
  if (contradictory) {
    const next = boolLit(mode === 'or');
    record(
      ctx,
      'simplify.normalize.contradiction',
      junctionFrom(mode, flat),
      next,
      live,
    );
    return next;
  }
  const result = junctionFrom(mode, flat);
  if (!equals(live, result)) {
    record(ctx, 'simplify.normalize.identity', live, result, live);
  }
  return result;
}

function normalizeAnd(
  expr: Extract<Expr, { kind: 'and' }>,
  ctx?: Readonly<OptimizeContext>,
): Expr {
  const live: Expr = expr;
  const flat = flattenAnd(expr.exprs.map((e) => normalizeExpr(e, ctx)));
  const before = junctionFrom('and', flat);
  const factored = factorAndOfOrs(flat);
  if (factored !== null) {
    const next = normalizeQuiet({ kind: 'or', exprs: factored.exprs });
    record(ctx, 'simplify.normalize.factor', before, next, live);
    return next;
  }
  if (flat.some((e) => e.kind === 'bool' && !e.value)) {
    const next = boolLit(false);
    record(ctx, 'simplify.normalize.boolFold', before, next, live);
    return next;
  }
  const dropped = dropIdentityUnits('and', flat, ctx, live);
  if (dropped.done !== undefined) {
    return dropped.done;
  }
  return finishJunction('and', dropped.flat, ctx, dropped.live);
}

function normalizeOr(
  expr: Extract<Expr, { kind: 'or' }>,
  ctx?: Readonly<OptimizeContext>,
): Expr {
  const live: Expr = expr;
  const flat = flattenOr(expr.exprs.map((e) => normalizeExpr(e, ctx)));
  const before = junctionFrom('or', flat);
  const factored = factorOrOfAnds(flat);
  if (factored !== null) {
    const next = normalizeQuiet({ kind: 'and', exprs: factored.exprs });
    record(ctx, 'simplify.normalize.factor', before, next, live);
    return next;
  }
  if (flat.some((e) => e.kind === 'bool' && e.value)) {
    const next = boolLit(true);
    record(ctx, 'simplify.normalize.boolFold', before, next, live);
    return next;
  }
  const dropped = dropIdentityUnits('or', flat, ctx, live);
  if (dropped.done !== undefined) {
    return dropped.done;
  }
  return finishJunction('or', dropped.flat, ctx, dropped.live);
}
