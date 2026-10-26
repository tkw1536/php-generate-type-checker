import type { Arg, Expr } from '../../../ir/types.ts';
import { boolLit, callExpr } from '../../../ir/index.ts';
import { equals } from '../../../ir/equals.ts';
import {
  matchCountEqualsPositive,
  nonNegIntLiteral,
} from '../../lib/implyArrayEmpty.ts';
import type { OptimizeContext } from '../../context.ts';
import { proveProofToChildren } from '../../proof/toTrace.ts';
import { commitReason } from '../../trace/commit.ts';
import { exprRewrite } from '../../trace/rewrite.ts';
import type { TracePos } from '../../trace/types.ts';
import type { FactEnv } from './env.types.ts';
import type { HostCursor } from './substitute.absorb.ts';
import { proveTrueProof } from './substitute.prove.ts';

/**
 * Match `array_key_exists(K, $x)` with non-neg int literal key K.
 */
function matchArrayKeyExistsInt(
  expr: Expr,
): { readonly key: number; readonly subject: Arg } | null {
  if (
    expr.kind !== 'call' ||
    expr.name !== 'array_key_exists' ||
    expr.args.length !== 2
  ) {
    return null;
  }
  const key = nonNegIntLiteral(expr.args[0]);
  const subject = expr.args[1];
  if (key === null || subject === undefined) {
    return null;
  }
  return { key, subject };
}

function sameArg(a: Arg, b: Arg): boolean {
  return equals(callExpr('count', [a]), callExpr('count', [b]));
}

/**
 * Find a known-true `count($x) === N` (N≥1) for subject `$x` in the env.
 */
function findCountEqualsPositive(
  env: FactEnv,
  subject: Arg,
): { readonly expr: Expr; readonly n: number } | null {
  for (const fact of env.trueFacts) {
    const matched = matchCountEqualsPositive(fact.expr);
    if (matched !== null && sameArg(matched.subject, subject)) {
      return { expr: fact.expr, n: matched.n };
    }
  }
  return null;
}

/**
 * Under known-true `array_is_list($x)` and `count($x) === N`, rewrite
 * `array_key_exists(k, $x)` → TRUE when `0 <= k < N`.
 */
export function normalizeListCountKeyExists(
  expr: Expr,
  env: FactEnv,
  ctx: Readonly<OptimizeContext> | undefined,
  pos: TracePos,
  host: HostCursor,
): { readonly expr: Expr; readonly pos: TracePos } | null {
  const matched = matchArrayKeyExistsInt(expr);
  if (matched === null) {
    return null;
  }
  const listExpr = callExpr('array_is_list', [matched.subject]);
  const listProof = proveTrueProof(listExpr, env);
  if (listProof === null) {
    return null;
  }
  const countFact = findCountEqualsPositive(env, matched.subject);
  if (countFact === null || matched.key >= countFact.n) {
    return null;
  }
  const countProof = proveTrueProof(countFact.expr, env);
  if (countProof === null) {
    return null;
  }
  const after = boolLit(true);
  if (ctx === undefined) {
    return { expr: after, pos };
  }
  const children = [
    ...proveProofToChildren(listExpr, boolLit(true), listProof),
    ...proveProofToChildren(countFact.expr, boolLit(true), countProof),
  ];
  const rewrite = exprRewrite(
    'facts.normalize.listCountKeyExists',
    expr,
    after,
    children,
  );
  const nextPos = commitReason(ctx, pos, rewrite.reason, host.current);
  host.apply(expr, after);
  return { expr: after, pos: nextPos };
}
