import type { Expr } from '../../../ir/types.ts';
import { andExpr, boolLit, notExpr, orExpr } from '../../../ir/index.ts';
import type { ExprRewrite } from '../../trace/types.ts';
import {
  QuietStepSink,
  noteNormalize,
  noteNormalizeParent,
  rewriteFromQuiet,
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

/** Normalize an expression; returns value + reason (no checker commits). */
export function normalizeExpr(expr: Expr): ExprRewrite {
  const quiet = new QuietStepSink();
  const result = normalizeExprInner(expr, quiet);
  return rewriteFromQuiet(result, quiet);
}

/**
 * Normalize collecting nested rewrite steps for a parent (De Morgan / etc.).
 */
export function normalizeQuiet(expr: Expr): {
  readonly result: Expr;
  readonly steps: ReturnType<QuietStepSink['snapshot']>;
} {
  const quiet = new QuietStepSink();
  const result = normalizeExprInner(expr, quiet);
  return { result, steps: quiet.snapshot() };
}

function normalizeExprInner(expr: Expr, quiet: QuietStepSink): Expr {
  switch (expr.kind) {
    case 'not':
      return normalizeNot(expr, quiet);
    case 'and':
      return normalizeAnd(expr, quiet);
    case 'or':
      return normalizeOr(expr, quiet);
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
  inner: Extract<Expr, { kind: 'not' }>,
  quiet: QuietStepSink,
): Expr {
  const folded = normalizeQuiet(inner.expr);
  return noteNormalizeParent(
    quiet,
    'simplify.normalize.doubleNeg',
    before,
    folded.result,
    folded.steps,
  );
}

function applyDeMorgan(
  before: Expr,
  nextSeed: Expr,
  quiet: QuietStepSink,
): Expr {
  const folded = normalizeQuiet(nextSeed);
  return noteNormalizeParent(
    quiet,
    'simplify.normalize.deMorgan',
    before,
    folded.result,
    folded.steps,
  );
}

function normalizeNot(
  expr: Extract<Expr, { kind: 'not' }>,
  quiet: QuietStepSink,
): Expr {
  const inner = normalizeExprInner(expr.expr, quiet);
  const before: Expr = { kind: 'not', expr: inner };
  if (inner.kind === 'bool') {
    const next = boolLit(!inner.value);
    return noteNormalize(quiet, 'simplify.normalize.boolFold', before, next);
  }
  if (inner.kind === 'not') {
    return collapseDoubleNeg(before, inner, quiet);
  }
  if (inner.kind === 'and') {
    return applyDeMorgan(
      before,
      orExpr(inner.exprs.map((e) => notExpr(e))),
      quiet,
    );
  }
  if (inner.kind === 'or') {
    return applyDeMorgan(
      before,
      andExpr(inner.exprs.map((e) => notExpr(e))),
      quiet,
    );
  }
  return before;
}

function factorJunction(
  before: Expr,
  factored: Expr,
  quiet: QuietStepSink,
): Expr {
  const folded = normalizeQuiet(factored);
  return noteNormalizeParent(
    quiet,
    'simplify.normalize.factor',
    before,
    folded.result,
    folded.steps,
  );
}

function normalizeAnd(
  expr: Extract<Expr, { kind: 'and' }>,
  quiet: QuietStepSink,
): Expr {
  const live: Expr = expr;
  const flat = flattenAnd(expr.exprs.map((e) => normalizeExprInner(e, quiet)));
  const before = junctionFrom('and', flat);
  const factored = factorAndOfOrs(flat);
  if (factored !== null) {
    return factorJunction(
      before,
      { kind: 'or', exprs: factored.exprs },
      quiet,
    );
  }
  if (flat.some((e) => e.kind === 'bool' && !e.value)) {
    const next = boolLit(false);
    return noteNormalize(quiet, 'simplify.normalize.boolFold', before, next);
  }
  const dropped = dropIdentityUnits('and', flat, quiet, live);
  if (dropped.done !== undefined) {
    return dropped.done;
  }
  return finishJunction('and', dropped.flat, quiet, dropped.live);
}

function normalizeOr(
  expr: Extract<Expr, { kind: 'or' }>,
  quiet: QuietStepSink,
): Expr {
  const live: Expr = expr;
  const flat = flattenOr(expr.exprs.map((e) => normalizeExprInner(e, quiet)));
  const before = junctionFrom('or', flat);
  const factored = factorOrOfAnds(flat);
  if (factored !== null) {
    return factorJunction(
      before,
      { kind: 'and', exprs: factored.exprs },
      quiet,
    );
  }
  if (flat.some((e) => e.kind === 'bool' && e.value)) {
    const next = boolLit(true);
    return noteNormalize(quiet, 'simplify.normalize.boolFold', before, next);
  }
  const dropped = dropIdentityUnits('or', flat, quiet, live);
  if (dropped.done !== undefined) {
    return dropped.done;
  }
  return finishJunction('or', dropped.flat, quiet, dropped.live);
}
