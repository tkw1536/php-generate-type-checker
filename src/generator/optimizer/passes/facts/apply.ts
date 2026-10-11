import type { Block, Stmt, ValueRef } from '../../../ir/types.ts';
import {
  callExpr,
  orExpr,
  refArg,
  variableRef,
} from '../../../ir/index.ts';
import { nonDecimalIntStringExpr } from '../../../decimalIntString.ts';
import type { OptimizeContext } from '../../context.ts';
import type { BlockPass, BlockPassResult } from '../../pass.ts';
import { envEventsToChildren } from '../../proof/toTrace.ts';
import { commitEnvExtend, withScope } from '../../trace/commit.ts';
import type { TracePos } from '../../trace/types.ts';
import { withFalseFact, withTrueFact } from './env.ts';
import {
  type FactEnv,
  EnvTraceSink,
  emptyFactEnv,
} from './env.types.ts';
import { substituteFacts } from './substitute.ts';

/**
 * True when an `if` body (linear IR, no else) always reaches `return` if entered:
 * the last statement must be `return`, so any `if`/`foreach` inside either
 * returns there or falls through to that trailing `return`.
 */
export function blockAlwaysExitsWhenEntered(block: Block): boolean {
  // Note: Checking only the last statement assumes DCE has run.
  // This may not be true this time, but will be eventually.
  const last = block.at(-1);
  return last !== undefined && last.kind === 'return';
}

function flushEnv(
  ctx: Readonly<OptimizeContext> | undefined,
  pos: TracePos,
  sink: EnvTraceSink,
): void {
  if (ctx === undefined) {
    sink.take();
    return;
  }
  const events = sink.take();
  if (events.length === 0) {
    return;
  }
  commitEnvExtend(ctx, pos, envEventsToChildren(events));
}

function applyKnownFactsStmt(
  stmt: Stmt,
  env: FactEnv,
  ctx: Readonly<OptimizeContext> | undefined,
  pos: TracePos,
  sink: EnvTraceSink,
): { readonly stmt: Stmt; readonly env: FactEnv; readonly pos: TracePos; readonly done: boolean } {
  switch (stmt.kind) {
    case 'if': {
      const next = applyKnownFactsIf(stmt, env, ctx, pos, sink);
      return { stmt: next.stmt, env: next.env, pos: next.pos, done: false };
    }
    case 'foreach': {
      const next = applyKnownFactsForeach(stmt, env, ctx, pos, sink);
      return { stmt: next.stmt, env, pos: next.pos, done: false };
    }
    case 'return': {
      const sub = substituteFacts(stmt.expr, env, ctx, pos, sink);
      return {
        stmt: { kind: 'return', expr: sub.expr },
        env,
        pos: sub.pos,
        done: true,
      };
    }
    default:
      throw new Error('never reached');
  }
}

export function applyKnownFacts(
  block: Block,
  env: FactEnv,
  ctx?: Readonly<OptimizeContext>,
  pos?: TracePos,
  sink?: EnvTraceSink,
): BlockPassResult {
  let currentPos = pos ?? { checker: block, scope: block };
  const out: Stmt[] = [];
  let currentEnv = env;
  const envSink = sink ?? new EnvTraceSink();

  for (const stmt of block) {
    const next = applyKnownFactsStmt(
      stmt,
      currentEnv,
      ctx,
      currentPos,
      envSink,
    );
    out.push(next.stmt);
    currentEnv = next.env;
    currentPos = next.pos;
    if (next.done) {
      return { block: out, pos: currentPos };
    }
  }

  return { block: out, pos: currentPos };
}

function applyKnownFactsIf(
  stmt: Extract<Stmt, { kind: 'if' }>,
  env: FactEnv,
  ctx: Readonly<OptimizeContext> | undefined,
  pos: TracePos,
  sink: EnvTraceSink,
): { stmt: Stmt; env: FactEnv; pos: TracePos } {
  const condSub = substituteFacts(stmt.cond, env, ctx, pos, sink);
  const cond = condSub.expr;
  const bodySink = new EnvTraceSink();
  const bodyEnv = withTrueFact(env, cond, 'ifTrue', 'assumed', undefined, bodySink);
  flushEnv(ctx, condSub.pos, bodySink);
  const newBody = applyKnownFacts(
    stmt.body,
    bodyEnv,
    ctx,
    withScope(condSub.pos, stmt.body),
    sink,
  );
  let nextEnv = env;
  if (blockAlwaysExitsWhenEntered(stmt.body)) {
    const falseSink = new EnvTraceSink();
    nextEnv = withFalseFact(
      env,
      cond,
      'ifFalse',
      'assumed',
      undefined,
      falseSink,
    );
    flushEnv(ctx, newBody.pos, falseSink);
  }
  return {
    stmt: { kind: 'if', cond, body: newBody.block },
    env: nextEnv,
    pos: newBody.pos,
  };
}

/**
 * IR `foreach` is only emitted for arrays (parameterized `iterable` is rejected).
 * PHP array keys from foreach are always `int|non-decimal-int-string`.
 */
function seedForeachArrayKeyFacts(
  env: FactEnv,
  key: ValueRef,
  sink: EnvTraceSink,
): FactEnv {
  const s = refArg(key);
  const isInt = callExpr('is_int', [s]);
  const isString = callExpr('is_string', [s]);
  const nonDecimal = nonDecimalIntStringExpr(s);
  let next = env;
  for (const fact of [
    orExpr([isInt, isString]),
    orExpr([isString, isInt]),
    orExpr([isInt, nonDecimal]),
    orExpr([nonDecimal, isInt]),
  ]) {
    next = withTrueFact(next, fact, 'arrayKey', 'assumed', undefined, sink);
  }
  return next;
}

function applyKnownFactsForeach(
  stmt: Extract<Stmt, { kind: 'foreach' }>,
  env: FactEnv,
  ctx: Readonly<OptimizeContext> | undefined,
  pos: TracePos,
  sink: EnvTraceSink,
): { stmt: Stmt; pos: TracePos } {
  const keySink = new EnvTraceSink();
  const bodyEnv =
    stmt.keyVar === null
      ? env
      : seedForeachArrayKeyFacts(env, variableRef(stmt.keyVar), keySink);
  flushEnv(ctx, pos, keySink);
  const body = applyKnownFacts(
    stmt.body,
    bodyEnv,
    ctx,
    withScope(pos, stmt.body),
    sink,
  );
  return {
    stmt: { ...stmt, body: body.block },
    pos: body.pos,
  };
}

export const factsPass: BlockPass = {
  id: 'facts',
  run(block, ctx, pos) {
    return applyKnownFacts(block, emptyFactEnv(), ctx, pos);
  },
};
