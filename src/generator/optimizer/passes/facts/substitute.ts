import type { Expr } from '../../../ir/types.ts';
import { andExpr, boolLit, orExpr } from '../../../ir/index.ts';
import { equals } from '../../../ir/equals.ts';
import type { OptimizeContext } from '../../context.ts';
import { proveProofToChildren } from '../../proof/toTrace.ts';
import { commitReason } from '../../trace/commit.ts';
import { exprRewrite } from '../../trace/rewrite.ts';
import type { TracePos } from '../../trace/types.ts';
import { withTrueFact } from './env.ts';
import { type FactEnv } from './env.types.ts';
import {
  absorbOperandsModuloFacts,
  HostCursor,
} from './substitute.absorb.ts';
import { applyFactRewrites } from '../../theory/rewrite.ts';
import { proveFalseProof, proveTrueProof } from './substitute.prove.ts';

function commitProve(
  ctx: Readonly<OptimizeContext> | undefined,
  pos: TracePos,
  host: HostCursor,
  rule: 'facts.proveTrue' | 'facts.proveFalse',
  before: Expr,
  after: Expr,
  proof: NonNullable<ReturnType<typeof proveTrueProof>>,
): TracePos {
  if (ctx === undefined || equals(before, after)) {
    return pos;
  }
  const children = proveProofToChildren(after, proof);
  const rewrite = exprRewrite(rule, before, after, children);
  const next = commitReason(ctx, pos, rewrite.reason, host.current);
  host.apply(before, after);
  return next;
}

export function substituteFacts(
  expr: Expr,
  env: FactEnv,
  ctx?: Readonly<OptimizeContext>,
  pos?: TracePos,
): { readonly expr: Expr; readonly pos: TracePos } {
  const host = new HostCursor(expr);
  const startPos = pos ?? { checker: [], scope: [] };
  return substituteFactsInner(expr, env, ctx, startPos, host);
}

function tryNormalizeFacts(
  expr: Expr,
  env: FactEnv,
  ctx: Readonly<OptimizeContext> | undefined,
  pos: TracePos,
  host: HostCursor,
): { readonly expr: Expr; readonly pos: TracePos } | null {
  return applyFactRewrites(expr, env, ctx, pos, host);
}

function substituteFactsInner(
  expr: Expr,
  env: FactEnv,
  ctx: Readonly<OptimizeContext> | undefined,
  pos: TracePos,
  host: HostCursor,
): { readonly expr: Expr; readonly pos: TracePos } {
  if (expr.kind === 'bool') {
    return { expr, pos };
  }
  const falseProof = proveFalseProof(expr, env);
  if (falseProof !== null) {
    const after = boolLit(false);
    return {
      expr: after,
      pos: commitProve(
        ctx,
        pos,
        host,
        'facts.proveFalse',
        expr,
        after,
        falseProof,
      ),
    };
  }
  const trueProof = proveTrueProof(expr, env);
  if (trueProof !== null) {
    const after = boolLit(true);
    return {
      expr: after,
      pos: commitProve(ctx, pos, host, 'facts.proveTrue', expr, after, trueProof),
    };
  }
  const normalized = tryNormalizeFacts(expr, env, ctx, pos, host);
  if (normalized !== null) {
    return normalized;
  }
  return substituteFactsShallow(expr, env, ctx, pos, host);
}

function seedAndConjunct(
  env: FactEnv,
  conjunct: Expr,
  ctx: Readonly<OptimizeContext> | undefined,
  pos: TracePos,
  host: HostCursor,
): { readonly expr: Expr; readonly env: FactEnv; readonly pos: TracePos } {
  const next = substituteFactsInner(conjunct, env, ctx, pos, host);
  const seeded = withTrueFact(env, conjunct, 'andConjunct');
  return { expr: next.expr, env: seeded, pos: next.pos };
}

function substituteFactsAnd(
  expr: Extract<Expr, { kind: 'and' }>,
  env: FactEnv,
  ctx: Readonly<OptimizeContext> | undefined,
  pos: TracePos,
  host: HostCursor,
): { readonly expr: Expr; readonly pos: TracePos } {
  let currentPos = pos;
  let currentEnv = env;
  let changed = false;
  let exprs = expr.exprs.map((e) => {
    const next = seedAndConjunct(currentEnv, e, ctx, currentPos, host);
    changed = changed || next.expr !== e;
    currentPos = next.pos;
    currentEnv = next.env;
    return next.expr;
  });
  const absorbed = absorbOperandsModuloFacts(
    exprs,
    'and',
    env,
    ctx,
    currentPos,
    host,
  );
  changed = changed || absorbed.exprs.length !== exprs.length;
  exprs = absorbed.exprs;
  return {
    expr: changed ? andExpr(exprs) : expr,
    pos: absorbed.pos,
  };
}

function substituteFactsOr(
  expr: Extract<Expr, { kind: 'or' }>,
  env: FactEnv,
  ctx: Readonly<OptimizeContext> | undefined,
  pos: TracePos,
  host: HostCursor,
): { readonly expr: Expr; readonly pos: TracePos } {
  let currentPos = pos;
  let changed = false;
  let exprs = expr.exprs.map((e) => {
    const next = substituteFactsInner(e, env, ctx, currentPos, host);
    if (next.expr !== e) {
      changed = true;
    }
    currentPos = next.pos;
    return next.expr;
  });
  const absorbed = absorbOperandsModuloFacts(
    exprs,
    'or',
    env,
    ctx,
    currentPos,
    host,
  );
  if (absorbed.exprs.length !== exprs.length) {
    changed = true;
    exprs = absorbed.exprs;
  }
  return {
    expr: changed ? orExpr(exprs) : expr,
    pos: absorbed.pos,
  };
}

function substituteFactsNot(
  expr: Extract<Expr, { kind: 'not' }>,
  env: FactEnv,
  ctx: Readonly<OptimizeContext> | undefined,
  pos: TracePos,
  host: HostCursor,
): { readonly expr: Expr; readonly pos: TracePos } {
  const inner = substituteFactsInner(expr.expr, env, ctx, pos, host);
  if (inner.expr.kind !== 'bool') {
    return {
      expr: inner.expr === expr.expr ? expr : { kind: 'not', expr: inner.expr },
      pos: inner.pos,
    };
  }
  const before: Expr = { kind: 'not', expr: inner.expr };
  const next = boolLit(!inner.expr.value);
  if (ctx === undefined || equals(before, next)) {
    return { expr: next, pos: inner.pos };
  }
  const nextPos = commitReason(
    ctx,
    inner.pos,
    exprRewrite('simplify.normalize.boolFold', before, next).reason,
    host.current,
  );
  host.apply(before, next);
  return { expr: next, pos: nextPos };
}

function substituteFactsShallow(
  expr: Expr,
  env: FactEnv,
  ctx: Readonly<OptimizeContext> | undefined,
  pos: TracePos,
  host: HostCursor,
): { readonly expr: Expr; readonly pos: TracePos } {
  switch (expr.kind) {
    case 'bool':
    case 'call':
    case 'bin':
    case 'instanceof':
    case 'call_checker':
      return { expr, pos };
    case 'not':
      return substituteFactsNot(expr, env, ctx, pos, host);
    case 'and':
      return substituteFactsAnd(expr, env, ctx, pos, host);
    case 'or':
      return substituteFactsOr(expr, env, ctx, pos, host);
    default:
      throw new Error('never reached');
  }
}
