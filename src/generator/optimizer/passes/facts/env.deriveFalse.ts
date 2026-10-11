import type { Expr } from '../../../ir/types.ts';
import { binExpr, notExpr, orExpr } from '../../../ir/index.ts';
import type { FactMutators, Flags } from './env.mutators.ts';
import type {
  EnvTraceSink,
  FactEntry,
  FactEnv,
  FactOriginId,
} from './env.types.ts';

function deriveFalseOr(
  env: FactEnv,
  canon: Extract<Expr, { kind: 'or' }>,
  origin: FactOriginId,
  from: FactEntry,
  sink: EnvTraceSink | undefined,
  m: FactMutators,
): FactEnv {
  let next = env;
  for (const disjunct of canon.exprs) {
    next = m.withFalse(
      next,
      disjunct,
      origin,
      'orSplit',
      undefined,
      sink,
      from,
      'false',
    );
  }
  return next;
}

function deriveFalseAnd(
  env: FactEnv,
  canon: Extract<Expr, { kind: 'and' }>,
  origin: FactOriginId,
  from: FactEntry,
  flags: Flags | undefined,
  sink: EnvTraceSink | undefined,
  m: FactMutators,
): FactEnv {
  if (flags?.skipDeMorgan === true) {
    return env;
  }
  return m.withTrue(
    env,
    orExpr(canon.exprs.map(notExpr)),
    origin,
    'deMorgan',
    { skipDeMorgan: true },
    sink,
    from,
    'false',
  );
}

export function deriveFalseFacts(
  env: FactEnv,
  canon: Expr,
  origin: FactOriginId,
  from: FactEntry,
  flags: Flags | undefined,
  sink: EnvTraceSink | undefined,
  m: FactMutators,
): FactEnv {
  switch (canon.kind) {
    case 'or':
      return deriveFalseOr(env, canon, origin, from, sink, m);
    case 'bin':
      return m.withFalse(
        env,
        binExpr(canon.op, canon.right, canon.left),
        origin,
        'commute',
        undefined,
        sink,
        from,
        'false',
      );
    case 'not':
      return m.withTrue(
        env,
        canon.expr,
        origin,
        'notFlip',
        undefined,
        sink,
        from,
        'false',
      );
    case 'and':
      return deriveFalseAnd(env, canon, origin, from, flags, sink, m);
    case 'bool':
    case 'call':
    case 'call_checker':
    case 'instanceof':
      return env;
    default:
      throw new Error('never reached');
  }
}
