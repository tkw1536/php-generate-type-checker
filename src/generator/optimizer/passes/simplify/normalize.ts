import type { Expr } from '../../../ir/types.ts';
import { andExpr, boolLit, notExpr, orExpr } from '../../../ir/index.ts';
import type { OptimizeContext } from '../../context.ts';
import {
  QuietStepSink,
  recordNormalize,
  recordNormalizeParent,
} from './normalize.trace.ts';
import {
  dropIdentityUnits,
  finishJunction,
  junctionFrom,
} from './normalize.junction.ts';
import {
  factorAndOfOrs,
  factorOrOfAnds,
  flattenAnd,
  flattenOr,
} from './normalize.helpers.ts';

export function normalizeExpr(expr: Expr, ctx?: Readonly<OptimizeContext>): Expr {
  return normalizeExprInner(expr, ctx, null);
}

/**
 * Normalize without live IR updates, collecting nested rewrite steps for the
 * parent De Morgan / doubleNeg / factor event.
 */
function normalizeQuiet(expr: Expr): {
  readonly result: Expr;
  readonly steps: ReturnType<QuietStepSink['snapshot']>;
} {
  const quiet = new QuietStepSink();
  const result = normalizeExprInner(expr, undefined, quiet);
  return { result, steps: quiet.snapshot() };
}

function normalizeExprInner(
  expr: Expr,
  ctx: Readonly<OptimizeContext> | undefined,
  quiet: QuietStepSink | null,
): Expr {
  switch (expr.kind) {
    case 'not':
      return normalizeNot(expr, ctx, quiet);
    case 'and':
      return normalizeAnd(expr, ctx, quiet);
    case 'or':
      return normalizeOr(expr, ctx, quiet);
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

function collapseDoubleNeg(
  before: Expr,
  live: Expr,
  inner: Extract<Expr, { kind: 'not' }>,
  ctx: Readonly<OptimizeContext> | undefined,
  quiet: QuietStepSink | null,
): Expr {
  const folded = normalizeQuiet(inner.expr);
  recordNormalizeParent(
    ctx,
    quiet,
    'simplify.normalize.doubleNeg',
    before,
    folded.result,
    live,
    folded.steps,
  );
  return folded.result;
}

function applyDeMorgan(
  before: Expr,
  live: Expr,
  nextSeed: Expr,
  ctx: Readonly<OptimizeContext> | undefined,
  quiet: QuietStepSink | null,
): Expr {
  const folded = normalizeQuiet(nextSeed);
  recordNormalizeParent(
    ctx,
    quiet,
    'simplify.normalize.deMorgan',
    before,
    folded.result,
    live,
    folded.steps,
  );
  return folded.result;
}

function normalizeNot(
  expr: Extract<Expr, { kind: 'not' }>,
  ctx: Readonly<OptimizeContext> | undefined,
  quiet: QuietStepSink | null,
): Expr {
  const inner = normalizeExprInner(expr.expr, ctx, quiet);
  const before: Expr = { kind: 'not', expr: inner };
  if (inner.kind === 'bool') {
    const next = boolLit(!inner.value);
    recordNormalize(ctx, quiet, 'simplify.normalize.boolFold', before, next, expr);
    return next;
  }
  if (inner.kind === 'not') {
    return collapseDoubleNeg(before, expr, inner, ctx, quiet);
  }
  if (inner.kind === 'and') {
    return applyDeMorgan(
      before,
      expr,
      orExpr(inner.exprs.map((e) => notExpr(e))),
      ctx,
      quiet,
    );
  }
  if (inner.kind === 'or') {
    return applyDeMorgan(
      before,
      expr,
      andExpr(inner.exprs.map((e) => notExpr(e))),
      ctx,
      quiet,
    );
  }
  return before;
}

function factorJunction(
  before: Expr,
  live: Expr,
  factored: Expr,
  ctx: Readonly<OptimizeContext> | undefined,
  quiet: QuietStepSink | null,
): Expr {
  const folded = normalizeQuiet(factored);
  recordNormalizeParent(
    ctx,
    quiet,
    'simplify.normalize.factor',
    before,
    folded.result,
    live,
    folded.steps,
  );
  return folded.result;
}

function normalizeAnd(
  expr: Extract<Expr, { kind: 'and' }>,
  ctx: Readonly<OptimizeContext> | undefined,
  quiet: QuietStepSink | null,
): Expr {
  const live: Expr = expr;
  const flat = flattenAnd(
    expr.exprs.map((e) => normalizeExprInner(e, ctx, quiet)),
  );
  const before = junctionFrom('and', flat);
  const factored = factorAndOfOrs(flat);
  if (factored !== null) {
    return factorJunction(
      before,
      live,
      { kind: 'or', exprs: factored.exprs },
      ctx,
      quiet,
    );
  }
  if (flat.some((e) => e.kind === 'bool' && !e.value)) {
    const next = boolLit(false);
    recordNormalize(ctx, quiet, 'simplify.normalize.boolFold', before, next, live);
    return next;
  }
  const dropped = dropIdentityUnits('and', flat, ctx, quiet, live);
  if (dropped.done !== undefined) {
    return dropped.done;
  }
  return finishJunction('and', dropped.flat, ctx, quiet, dropped.live);
}

function normalizeOr(
  expr: Extract<Expr, { kind: 'or' }>,
  ctx: Readonly<OptimizeContext> | undefined,
  quiet: QuietStepSink | null,
): Expr {
  const live: Expr = expr;
  const flat = flattenOr(
    expr.exprs.map((e) => normalizeExprInner(e, ctx, quiet)),
  );
  const before = junctionFrom('or', flat);
  const factored = factorOrOfAnds(flat);
  if (factored !== null) {
    return factorJunction(
      before,
      live,
      { kind: 'and', exprs: factored.exprs },
      ctx,
      quiet,
    );
  }
  if (flat.some((e) => e.kind === 'bool' && e.value)) {
    const next = boolLit(true);
    recordNormalize(ctx, quiet, 'simplify.normalize.boolFold', before, next, live);
    return next;
  }
  const dropped = dropIdentityUnits('or', flat, ctx, quiet, live);
  if (dropped.done !== undefined) {
    return dropped.done;
  }
  return finishJunction('or', dropped.flat, ctx, quiet, dropped.live);
}
