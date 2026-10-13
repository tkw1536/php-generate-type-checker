import type { Expr } from '../../../ir/types.ts';
import { andExpr, boolLit, orExpr } from '../../../ir/index.ts';
import { equals } from '../../../ir/equals.ts';
import type { OptimizeContext } from '../../context.ts';
import {
  envEventsToChildren,
  proveProofToChildren,
} from '../../proof/toTrace.ts';
import { commitEnvExtend, commitReason } from '../../trace/commit.ts';
import { exprRewrite } from '../../trace/rewrite.ts';
import type { TracePos } from '../../trace/types.ts';
import { withTrueFact } from './env.ts';
import {
  type EnvTraceSink,
  type FactEnv,
  EnvTraceSink as EnvSink,
  envOrigin,
} from './env.types.ts';
import {
  absorbOperandsModuloFacts,
  HostCursor,
} from './substitute.absorb.ts';
import { normalizeCountEmpty } from './substitute.countEmpty.ts';
import { proveFalseProof, proveTrueProof } from './substitute.prove.ts';

function flushEnv(
  ctx: Readonly<OptimizeContext> | undefined,
  pos: TracePos,
  sink: EnvTraceSink | undefined,
): void {
  if (ctx === undefined || sink === undefined) {
    return;
  }
  const events = sink.take();
  if (events.length === 0) {
    return;
  }
  commitEnvExtend(ctx, pos, envEventsToChildren(events));
}

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
  const children = proveProofToChildren(before, after, proof);
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
  sink?: EnvTraceSink,
): { readonly expr: Expr; readonly pos: TracePos } {
  const host = new HostCursor(expr);
  const startPos = pos ?? { checker: [], scope: [] };
  return substituteFactsInner(expr, env, ctx, startPos, host, sink);
}

function substituteFactsInner(
  expr: Expr,
  env: FactEnv,
  ctx: Readonly<OptimizeContext> | undefined,
  pos: TracePos,
  host: HostCursor,
  sink: EnvTraceSink | undefined,
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
  const countEmpty = normalizeCountEmpty(expr, env, ctx, pos, host);
  if (countEmpty !== null) {
    return countEmpty;
  }
  return substituteFactsShallow(expr, env, ctx, pos, host, sink);
}

function seedAndConjunct(
  env: FactEnv,
  conjunct: Expr,
  ctx: Readonly<OptimizeContext> | undefined,
  pos: TracePos,
  host: HostCursor,
  sink: EnvTraceSink | undefined,
): { readonly expr: Expr; readonly env: FactEnv; readonly pos: TracePos } {
  const next = substituteFactsInner(conjunct, env, ctx, pos, host, sink);
  const seeded = withTrueFact(
    env,
    conjunct,
    envOrigin(env),
    'assumed',
    undefined,
    sink,
  );
  flushEnv(ctx, next.pos, sink);
  return { expr: next.expr, env: seeded, pos: next.pos };
}

function substituteFactsAnd(
  expr: Extract<Expr, { kind: 'and' }>,
  env: FactEnv,
  ctx: Readonly<OptimizeContext> | undefined,
  pos: TracePos,
  host: HostCursor,
  sink: EnvTraceSink | undefined,
): { readonly expr: Expr; readonly pos: TracePos } {
  let currentPos = pos;
  let currentEnv = env;
  let changed = false;
  const localSink = ctx === undefined ? sink : (sink ?? new EnvSink());
  let exprs = expr.exprs.map((e) => {
    const next = seedAndConjunct(currentEnv, e, ctx, currentPos, host, localSink);
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
  sink: EnvTraceSink | undefined,
): { readonly expr: Expr; readonly pos: TracePos } {
  let currentPos = pos;
  let changed = false;
  let exprs = expr.exprs.map((e) => {
    const next = substituteFactsInner(e, env, ctx, currentPos, host, sink);
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
  sink: EnvTraceSink | undefined,
): { readonly expr: Expr; readonly pos: TracePos } {
  const inner = substituteFactsInner(expr.expr, env, ctx, pos, host, sink);
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
  sink: EnvTraceSink | undefined,
): { readonly expr: Expr; readonly pos: TracePos } {
  switch (expr.kind) {
    case 'bool':
    case 'call':
    case 'bin':
    case 'instanceof':
    case 'call_checker':
      return { expr, pos };
    case 'not':
      return substituteFactsNot(expr, env, ctx, pos, host, sink);
    case 'and':
      return substituteFactsAnd(expr, env, ctx, pos, host, sink);
    case 'or':
      return substituteFactsOr(expr, env, ctx, pos, host, sink);
    default:
      throw new Error('never reached');
  }
}
