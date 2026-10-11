import type { Expr } from '../../../ir/types.ts';
import {
  andExpr,
  binExpr,
  callExpr,
  notExpr,
} from '../../../ir/index.ts';
import {
  exclusiveTag,
  otherExclusiveNegations,
  typeCallImpliedByEquality,
} from '../../lib/exclusiveTypes.ts';
import { isAAllowStringSubject } from '../../lib/implies.ts';
import type { FactMutators, Flags } from './env.mutators.ts';
import type {
  EnvTraceSink,
  FactEntry,
  FactEnv,
  FactOriginId,
} from './env.types.ts';

function deriveExclusiveNegations(
  env: FactEnv,
  expr: Expr,
  origin: FactOriginId,
  from: FactEntry,
  sink: EnvTraceSink | undefined,
  m: FactMutators,
): FactEnv {
  const tag = exclusiveTag(expr);
  if (tag === null) {
    return env;
  }
  let next = env;
  for (const neg of otherExclusiveNegations(tag)) {
    next = m.withTrue(
      next,
      neg,
      origin,
      'exclusive',
      undefined,
      sink,
      from,
      'true',
    );
  }
  return next;
}

function deriveTrueCallFacts(
  env: FactEnv,
  expr: Extract<Expr, { kind: 'call' }>,
  origin: FactOriginId,
  from: FactEntry,
  sink: EnvTraceSink | undefined,
  m: FactMutators,
): FactEnv {
  let next = env;
  const subject = isAAllowStringSubject(expr);
  if (subject !== null) {
    next = m.withTrue(
      next,
      callExpr('class_exists', [subject]),
      origin,
      'isAClassExists',
      undefined,
      sink,
      from,
      'true',
    );
  }
  return deriveExclusiveNegations(next, expr, origin, from, sink, m);
}

function deriveTrueBinFacts(
  env: FactEnv,
  expr: Extract<Expr, { kind: 'bin' }>,
  origin: FactOriginId,
  from: FactEntry,
  sink: EnvTraceSink | undefined,
  m: FactMutators,
): FactEnv {
  let next = deriveExclusiveNegations(env, expr, origin, from, sink, m);
  const litType = typeCallImpliedByEquality(expr);
  if (litType !== null) {
    next = m.withTrue(
      next,
      litType,
      origin,
      'equalityType',
      undefined,
      sink,
      from,
      'true',
    );
  }
  return m.withTrue(
    next,
    binExpr(expr.op, expr.right, expr.left),
    origin,
    'commute',
    undefined,
    sink,
    from,
    'true',
  );
}

function deriveTrueAnd(
  env: FactEnv,
  expr: Extract<Expr, { kind: 'and' }>,
  origin: FactOriginId,
  from: FactEntry,
  sink: EnvTraceSink | undefined,
  m: FactMutators,
): FactEnv {
  let next = env;
  for (const conjunct of expr.exprs) {
    next = m.withTrue(
      next,
      conjunct,
      origin,
      'andSplit',
      undefined,
      sink,
      from,
      'true',
    );
  }
  return next;
}

function deriveTrueOr(
  env: FactEnv,
  expr: Extract<Expr, { kind: 'or' }>,
  origin: FactOriginId,
  from: FactEntry,
  flags: Flags | undefined,
  sink: EnvTraceSink | undefined,
  m: FactMutators,
): FactEnv {
  if (flags?.skipDeMorgan === true) {
    return env;
  }
  return m.withFalse(
    env,
    andExpr(expr.exprs.map(notExpr)),
    origin,
    'deMorgan',
    { skipDeMorgan: true },
    sink,
    from,
    'true',
  );
}

export function deriveTrueFacts(
  env: FactEnv,
  expr: Expr,
  origin: FactOriginId,
  from: FactEntry,
  flags: Flags | undefined,
  sink: EnvTraceSink | undefined,
  m: FactMutators,
): FactEnv {
  switch (expr.kind) {
    case 'and':
      return deriveTrueAnd(env, expr, origin, from, sink, m);
    case 'bin':
      return deriveTrueBinFacts(env, expr, origin, from, sink, m);
    case 'not':
      return m.withFalse(
        env,
        expr.expr,
        origin,
        'notFlip',
        undefined,
        sink,
        from,
        'true',
      );
    case 'or':
      return deriveTrueOr(env, expr, origin, from, flags, sink, m);
    case 'instanceof':
      return m.withTrue(
        env,
        callExpr('is_object', [expr.subject]),
        origin,
        'instanceofObject',
        undefined,
        sink,
        from,
        'true',
      );
    case 'call':
      return deriveTrueCallFacts(env, expr, origin, from, sink, m);
    case 'bool':
    case 'call_checker':
      return env;
    default:
      throw new Error('never reached');
  }
}
