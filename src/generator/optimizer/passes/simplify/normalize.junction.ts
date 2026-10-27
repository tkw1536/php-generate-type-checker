import type { Expr } from '../../../ir/types.ts';
import { equals } from '../../../ir/equals.ts';
import { andExpr, boolLit, orExpr } from '../../../ir/index.ts';
import { absorbImpliedOperandsProof } from '../../theory/absorb.ts';
import { implyProofToChildren } from '../../proof/toTrace.ts';
import {
  type QuietStepSink,
  noteNormalize,
  noteNormalizeWithChildren,
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

function sameOperandOrder(a: readonly Expr[], b: readonly Expr[]): boolean {
  if (a.length !== b.length) {
    return false;
  }
  for (let i = 0; i < a.length; i++) {
    if (!equals(a[i], b[i])) {
      return false;
    }
  }
  return true;
}

function absorbAndDedupe(
  mode: 'and' | 'or',
  flatIn: readonly Expr[],
  quiet: QuietStepSink,
  live: Expr,
): { readonly flat: Expr[]; readonly live: Expr } {
  let flat = [...flatIn];
  let nextLive = live;
  const beforeAbsorb = flat;
  const absorbed = absorbImpliedOperandsProof(flat, mode);
  flat = absorbed.exprs;
  if (flat.length !== beforeAbsorb.length) {
    nextLive = noteNormalizeWithChildren(
      quiet,
      'simplify.normalize.absorb',
      junctionFrom(mode, beforeAbsorb),
      junctionFrom(mode, flat),
      absorbed.drops.map((d) => {
        if (d.how.kind !== 'structural') {
          throw new Error('never reached');
        }
        return implyProofToChildren(d.from, d.to, d.how.imply);
      }),
    );
  }
  const beforeDedupe = flat;
  const deduped = dedupeOperands(flat);
  if (deduped.length !== beforeDedupe.length) {
    flat = deduped;
    nextLive = noteNormalize(
      quiet,
      'simplify.normalize.dedupe',
      junctionFrom(mode, beforeDedupe),
      junctionFrom(mode, flat),
    );
  }
  const beforeSort = flat;
  const sorted = sortOperands(flat);
  if (!sameOperandOrder(beforeSort, sorted)) {
    flat = sorted;
    nextLive = noteNormalize(
      quiet,
      'simplify.normalize.reorder',
      junctionFrom(mode, beforeSort),
      junctionFrom(mode, flat),
    );
  }
  return { flat, live: nextLive };
}

/** Drop AND true / OR false units; may fold to a bool literal. */
export function dropIdentityUnits(
  mode: 'and' | 'or',
  flat: readonly Expr[],
  quiet: QuietStepSink,
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
    noteNormalize(
      quiet,
      'simplify.normalize.boolFold',
      junctionFrom(mode, flat),
      next,
    );
    return { flat: [], live, done: next };
  }
  const next = junctionFrom(mode, without);
  const nextLive = noteNormalize(
    quiet,
    'simplify.normalize.identity',
    junctionFrom(mode, flat),
    next,
  );
  return { flat: [...without], live: nextLive };
}

export function finishJunction(
  mode: 'and' | 'or',
  flatIn: readonly Expr[],
  quiet: QuietStepSink,
  liveIn: Expr,
): Expr {
  const absorbed = absorbAndDedupe(mode, flatIn, quiet, liveIn);
  let flat = absorbed.flat;
  let live = absorbed.live;
  const contradictory =
    mode === 'and' ? hasContradiction(flat) : hasTautology(flat);
  if (contradictory) {
    const next = boolLit(mode === 'or');
    noteNormalize(
      quiet,
      'simplify.normalize.contradiction',
      junctionFrom(mode, flat),
      next,
    );
    return next;
  }
  const result = junctionFrom(mode, flat);
  if (!equals(live, result)) {
    noteNormalize(quiet, 'simplify.normalize.identity', live, result);
  }
  return result;
}
