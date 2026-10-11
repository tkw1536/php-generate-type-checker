import type { Expr } from '../../../ir/types.ts';
import { equals } from '../../../ir/equals.ts';
import { andExpr, boolLit, orExpr } from '../../../ir/index.ts';
import type { OptimizeContext } from '../../context.ts';
import { absorbImpliedOperands } from '../../lib/implies.ts';
import {
  type QuietStepSink,
  recordNormalize,
} from './normalize.trace.ts';
import { sortOperands } from './normalize.order.ts';
import {
  dedupeOperands,
  hasContradiction,
  hasTautology,
} from './normalize.helpers.ts';

export function junctionFrom(
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
  quiet: QuietStepSink | null,
  live: Expr,
): { readonly flat: Expr[]; readonly live: Expr } {
  let flat = [...flatIn];
  let nextLive = live;
  const beforeAbsorb = flat;
  flat = absorbImpliedOperands(flat, mode);
  if (flat.length !== beforeAbsorb.length) {
    nextLive = recordNormalize(
      ctx,
      quiet,
      'simplify.normalize.absorb',
      junctionFrom(mode, beforeAbsorb),
      junctionFrom(mode, flat),
      nextLive,
    );
  }
  const beforeDedupe = flat;
  flat = sortOperands(dedupeOperands(flat));
  if (flat.length !== beforeDedupe.length) {
    nextLive = recordNormalize(
      ctx,
      quiet,
      'simplify.normalize.dedupe',
      junctionFrom(mode, beforeDedupe),
      junctionFrom(mode, flat),
      nextLive,
    );
  }
  return { flat, live: nextLive };
}

/** Drop AND true / OR false units; may fold to a bool literal. */
export function dropIdentityUnits(
  mode: 'and' | 'or',
  flat: readonly Expr[],
  ctx: Readonly<OptimizeContext> | undefined,
  quiet: QuietStepSink | null,
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
    recordNormalize(
      ctx,
      quiet,
      'simplify.normalize.boolFold',
      junctionFrom(mode, flat),
      next,
      live,
    );
    return { flat: [], live, done: next };
  }
  const next = junctionFrom(mode, without);
  const nextLive = recordNormalize(
    ctx,
    quiet,
    'simplify.normalize.identity',
    junctionFrom(mode, flat),
    next,
    live,
  );
  return { flat: [...without], live: nextLive };
}

export function finishJunction(
  mode: 'and' | 'or',
  flatIn: readonly Expr[],
  ctx: Readonly<OptimizeContext> | undefined,
  quiet: QuietStepSink | null,
  liveIn: Expr,
): Expr {
  const absorbed = absorbAndDedupe(mode, flatIn, ctx, quiet, liveIn);
  let flat = absorbed.flat;
  let live = absorbed.live;
  const contradictory =
    mode === 'and' ? hasContradiction(flat) : hasTautology(flat);
  if (contradictory) {
    const next = boolLit(mode === 'or');
    recordNormalize(
      ctx,
      quiet,
      'simplify.normalize.contradiction',
      junctionFrom(mode, flat),
      next,
      live,
    );
    return next;
  }
  const result = junctionFrom(mode, flat);
  if (!equals(live, result)) {
    recordNormalize(ctx, quiet, 'simplify.normalize.identity', live, result, live);
  }
  return result;
}
