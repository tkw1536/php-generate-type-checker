import type { Expr } from '../../../ir/types.ts';
import { binExpr, notExpr, orExpr } from '../../../ir/index.ts';
import type { FactMutators, Flags } from './env.mutators.ts';
import type {
  FactEntry,
  FactEnv,
  FactOriginId,
} from './env.types.ts';

function deriveFalseOr(
  env: FactEnv,
  canon: Extract<Expr, { kind: 'or' }>,
  origin: FactOriginId,
  from: FactEntry,
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
  m: FactMutators,
): FactEnv {
  switch (canon.kind) {
    case 'or':
      return deriveFalseOr(env, canon, origin, from, m);
    case 'bin':
      return m.withFalse(
        env,
        binExpr(canon.op, canon.right, canon.left),
        origin,
        'commute',
        undefined,
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
        from,
        'false',
      );
    case 'and':
      return deriveFalseAnd(env, canon, origin, from, flags, m);
    case 'bool':
    case 'call':
    case 'call_checker':
    case 'instanceof':
      return env;
    default:
      throw new Error('never reached');
  }
}
