import type { Expr } from '../../../ir/types.ts';
import { andExpr, orExpr } from '../../../ir/index.ts';
import { equals } from '../../../ir/equals.ts';
import type { OptimizeContext } from '../../context.ts';
import { implyProof } from '../../theory/prove.ts';
import type { AbsorbDropProof } from '../../proof/types.ts';
import { absorbDropToChildren } from '../../proof/toTrace.ts';
import { commitReason } from '../../trace/commit.ts';
import { replaceExpr } from '../../trace/replaceExpr.ts';
import { exprRewrite } from '../../trace/rewrite.ts';
import type { TracePos } from '../../trace/types.ts';
import { canonicalizeFactExpr } from './canon.ts';
import type { FactEnv } from './env.types.ts';
import { impliesModuloFactsProof } from './substitute.prove.ts';

/** Tracks the live form of the top-level expr for host-scoped commits. */
export class HostCursor {
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

function junction(mode: 'and' | 'or', exprs: readonly Expr[]): Expr {
  return mode === 'and' ? andExpr(exprs) : orExpr(exprs);
}

function shouldDropOperand(
  candidate: Expr,
  other: Expr,
  mode: 'and' | 'or',
  env: FactEnv,
): AbsorbDropProof | null {
  if (equals(canonicalizeFactExpr(candidate), canonicalizeFactExpr(other))) {
    return null;
  }
  if (mode === 'or') {
    const how = impliesModuloFactsProof(candidate, other, env);
    if (how === null) {
      return null;
    }
    return { from: candidate, to: other, how };
  }
  const how = impliesModuloFactsProof(other, candidate, env);
  if (how === null) {
    return null;
  }
  return { from: other, to: candidate, how };
}

/** AND: drop B when (∧ others) ⇒ B, e.g. key_exists(k) under list ∧ key_exists(N). */
function andCoverAbsorbDrop(
  candidate: Expr,
  exprs: readonly Expr[],
  index: number,
): AbsorbDropProof | null {
  if (exprs.length < 3) {
    return null;
  }
  const others = exprs.filter((_, j) => j !== index);
  const cover = andExpr(others);
  const imply = implyProof(cover, candidate);
  if (imply === null) {
    return null;
  }
  return { from: cover, to: candidate, how: { kind: 'structural', imply } };
}

export function absorbOperandsModuloFacts(
  exprs: readonly Expr[],
  mode: 'and' | 'or',
  env: FactEnv,
  ctx: Readonly<OptimizeContext> | undefined,
  pos: TracePos,
  host: HostCursor,
): { readonly exprs: Expr[]; readonly pos: TracePos } {
  const kept: Expr[] = [];
  const drops: AbsorbDropProof[] = [];
  for (let i = 0; i < exprs.length; i++) {
    const candidate = exprs[i];
    let drop: AbsorbDropProof | null = null;
    for (let j = 0; j < exprs.length; j++) {
      if (i === j) {
        continue;
      }
      drop = shouldDropOperand(candidate, exprs[j], mode, env);
      if (drop !== null) {
        break;
      }
    }
    if (drop === null && mode === 'and') {
      drop = andCoverAbsorbDrop(candidate, exprs, i);
    }
    if (drop === null) {
      kept.push(candidate);
    } else {
      drops.push(drop);
    }
  }
  if (kept.length === exprs.length) {
    return { exprs: [...exprs], pos };
  }
  const before = junction(mode, exprs);
  const after = junction(mode, kept);
  if (equals(before, after) || ctx === undefined) {
    return { exprs: kept, pos };
  }
  if (drops.length === 0) {
    throw new Error('facts.absorb requires at least one implication proof');
  }
  const children = drops.map((d) => absorbDropToChildren(d));
  const rewrite = exprRewrite('facts.absorb', before, after, children);
  const nextPos = commitReason(ctx, pos, rewrite.reason, host.current);
  host.apply(before, after);
  return { exprs: kept, pos: nextPos };
}
