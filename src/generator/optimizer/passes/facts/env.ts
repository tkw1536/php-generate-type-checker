import type { Expr } from '../../../ir/types.ts';
import {
  andExpr,
  binExpr,
  callExpr,
  notExpr,
  orExpr,
} from '../../../ir/index.ts';
import { equals } from '../../../ir/equals.ts';
import { canonicalizeFactExpr } from './canon.ts';
import {
  exclusiveTag,
  otherExclusiveNegations,
  typeCallImpliedByEquality,
} from '../../lib/exclusiveTypes.ts';
import { isAAllowStringSubject } from '../../lib/implies.ts';

export type FactOriginId = 'ifTrue' | 'ifFalse' | 'arrayKey';

export type FactReasonId =
  | 'assumed'
  | 'andSplit'
  | 'orSplit'
  | 'notFlip'
  | 'commute'
  | 'deMorgan'
  | 'exclusive'
  | 'equalityType'
  | 'instanceofObject'
  | 'isAClassExists'
  /** Junction absorb justified by structural implication (no env fact needed). */
  | 'structural';

export type FactEntry = {
  readonly expr: Expr;
  readonly origin: FactOriginId;
  readonly reason: FactReasonId;
};

export type FactEnv = {
  readonly trueFacts: readonly FactEntry[];
  readonly falseFacts: readonly FactEntry[];
};

export function emptyFactEnv(): FactEnv {
  return { trueFacts: [], falseFacts: [] };
}

/** Build a fact entry for tests / manual env seeding. */
export function factEntry(
  expr: Expr,
  origin: FactOriginId,
  reason: FactReasonId = 'assumed',
): FactEntry {
  return { expr: canonicalizeFactExpr(expr), origin, reason };
}

// Environments are immutable.
// The functions {@link withTrueFact} and {@link withFalseFact} create new environments with new facts.
//
// These functions are mutually recursive to expand the set of facts.
// To prevent infinite recursion, when adding a new fact, these must be careful not increase expression complexity.
// Alternative they may add a flag to skip further expansion.

type Flags = {
  readonly skipDeMorgan?: true;
};

function hasTrue(env: FactEnv, expr: Expr): boolean {
  return env.trueFacts.some((f) => equals(f.expr, expr));
}

function hasFalse(env: FactEnv, expr: Expr): boolean {
  return env.falseFacts.some((f) => equals(f.expr, expr));
}

export function withTrueFact(
  env: FactEnv,
  expr: Expr,
  origin: FactOriginId,
  reason: FactReasonId = 'assumed',
  flags?: Flags,
): FactEnv {
  if (expr.kind === 'bool') {
    return env;
  }
  const canon = canonicalizeFactExpr(expr);
  if (hasTrue(env, canon)) {
    return env;
  }
  const entry: FactEntry = { expr: canon, origin, reason };
  const next: FactEnv = {
    ...env,
    trueFacts: [...env.trueFacts, entry],
  };
  return deriveTrueFacts(next, canon, origin, flags);
}

function deriveExclusiveNegations(
  env: FactEnv,
  expr: Expr,
  origin: FactOriginId,
): FactEnv {
  const tag = exclusiveTag(expr);
  if (tag === null) {
    return env;
  }
  let next = env;
  for (const neg of otherExclusiveNegations(tag)) {
    next = withTrueFact(next, neg, origin, 'exclusive');
  }
  return next;
}

function deriveTrueCallFacts(
  env: FactEnv,
  expr: Extract<Expr, { kind: 'call' }>,
  origin: FactOriginId,
): FactEnv {
  let next = env;
  const subject = isAAllowStringSubject(expr);
  if (subject !== null) {
    // `is_a($x, T::class, TRUE)` implies `class_exists($x)`.
    next = withTrueFact(
      next,
      callExpr('class_exists', [subject]),
      origin,
      'isAClassExists',
    );
  }
  return deriveExclusiveNegations(next, expr, origin);
}

function deriveTrueBinFacts(
  env: FactEnv,
  expr: Extract<Expr, { kind: 'bin' }>,
  origin: FactOriginId,
): FactEnv {
  let next = deriveExclusiveNegations(env, expr, origin);
  const litType = typeCallImpliedByEquality(expr);
  if (litType !== null) {
    // `$x === 0` implies `is_int($x)` (same idea for other typed literals).
    next = withTrueFact(next, litType, origin, 'equalityType');
  }
  // Commute operands so `$x === null` and `null === $x` match as the same fact.
  return withTrueFact(
    next,
    binExpr(expr.op, expr.right, expr.left),
    origin,
    'commute',
  );
}

function deriveTrueFacts(
  env: FactEnv,
  expr: Expr,
  origin: FactOriginId,
  flags?: Flags,
): FactEnv {
  switch (expr.kind) {
    case 'and': {
      let next = env;
      for (const conjunct of expr.exprs) {
        next = withTrueFact(next, conjunct, origin, 'andSplit');
      }
      return next;
    }
    case 'bin':
      return deriveTrueBinFacts(env, expr, origin);
    case 'not':
      return withFalseFact(env, expr.expr, origin, 'notFlip');
    case 'or':
      if (flags?.skipDeMorgan !== true) {
        // x || y => !!(x || y) => !(!x && !y)
        return withFalseFact(
          env,
          andExpr(expr.exprs.map(notExpr)),
          origin,
          'deMorgan',
          { skipDeMorgan: true },
        );
      }
      return env;
    case 'instanceof':
      // `$x instanceof T` implies `is_object($x)`.
      return withTrueFact(
        env,
        callExpr('is_object', [expr.subject]),
        origin,
        'instanceofObject',
      );
    case 'call':
      return deriveTrueCallFacts(env, expr, origin);
    case 'bool':
    case 'call_checker':
      return env;
    default:
      throw new Error('never reached');
  }
}

function deriveFalseFacts(
  env: FactEnv,
  canon: Expr,
  origin: FactOriginId,
  flags?: Flags,
): FactEnv {
  switch (canon.kind) {
    case 'or': {
      let next = env;
      for (const disjunct of canon.exprs) {
        next = withFalseFact(next, disjunct, origin, 'orSplit');
      }
      return next;
    }
    case 'bin':
      return withFalseFact(
        env,
        binExpr(canon.op, canon.right, canon.left),
        origin,
        'commute',
      );
    case 'not':
      return withTrueFact(env, canon.expr, origin, 'notFlip');
    case 'and':
      if (flags?.skipDeMorgan !== true) {
        // !(x && y) => !x || !y
        return withTrueFact(
          env,
          orExpr(canon.exprs.map(notExpr)),
          origin,
          'deMorgan',
          { skipDeMorgan: true },
        );
      }
      return env;
    case 'bool':
    case 'call':
    case 'call_checker':
    case 'instanceof':
      return env;
    default:
      throw new Error('never reached');
  }
}

export function withFalseFact(
  env: FactEnv,
  expr: Expr,
  origin: FactOriginId,
  reason: FactReasonId = 'assumed',
  flags?: Flags,
): FactEnv {
  if (expr.kind === 'bool') {
    return env;
  }
  const canon = canonicalizeFactExpr(expr);
  if (hasFalse(env, canon)) {
    return env;
  }
  const entry: FactEntry = { expr: canon, origin, reason };
  const next: FactEnv = {
    ...env,
    falseFacts: [...env.falseFacts, entry],
  };
  return deriveFalseFacts(next, canon, origin, flags);
}

/** Prefer an origin already present in the env; default to ifTrue. */
export function envOrigin(env: FactEnv): FactOriginId {
  const first = env.trueFacts[0] ?? env.falseFacts[0];
  return first?.origin ?? 'ifTrue';
}
