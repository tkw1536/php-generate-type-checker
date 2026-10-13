import type { Arg, Expr, ValueRef } from '../../../ir/types.ts';
import { binExpr, boolLit, callExpr, literalArg, refArg } from '../../../ir/index.ts';
import { equals } from '../../../ir/equals.ts';
import type { OptimizeContext } from '../../context.ts';
import { proveProofToChildren } from '../../proof/toTrace.ts';
import { commitReason } from '../../trace/commit.ts';
import { exprRewrite } from '../../trace/rewrite.ts';
import type { TracePos } from '../../trace/types.ts';
import type { FactEnv } from './env.types.ts';
import type { HostCursor } from './substitute.absorb.ts';
import { proveTrueProof } from './substitute.prove.ts';

function isZeroLiteral(arg: Arg): boolean {
  return arg.kind === 'literal' && arg.value === '0';
}

/** Subject of `count($x)` when `$x` is a ValueRef, or null. */
function countSubjectRef(arg: Arg): ValueRef | null {
  if (
    arg.kind !== 'call' ||
    arg.name !== 'count' ||
    arg.args.length !== 1 ||
    arg.args[0].kind !== 'ref'
  ) {
    return null;
  }
  return arg.args[0].ref;
}

/**
 * Match `count($x) === 0` / `0 === count($x)` / `!==` variants.
 * Returns the subject and whether the comparison is equality to zero.
 */
export function matchCountZeroCompare(
  expr: Expr,
): { readonly subject: ValueRef; readonly eqZero: boolean } | null {
  if (expr.kind !== 'bin' || (expr.op !== '===' && expr.op !== '!==')) {
    return null;
  }
  const leftCount = countSubjectRef(expr.left);
  const rightCount = countSubjectRef(expr.right);
  if (leftCount !== null && isZeroLiteral(expr.right)) {
    return { subject: leftCount, eqZero: expr.op === '===' };
  }
  if (rightCount !== null && isZeroLiteral(expr.left)) {
    return { subject: rightCount, eqZero: expr.op === '===' };
  }
  return null;
}

/**
 * Under known-true `is_array($x)`, rewrite `count($x) === 0` → `$x === []`
 * (and `!== 0` → `$x !== []`).
 */
export function normalizeCountEmpty(
  expr: Expr,
  env: FactEnv,
  ctx: Readonly<OptimizeContext> | undefined,
  pos: TracePos,
  host: HostCursor,
): { readonly expr: Expr; readonly pos: TracePos } | null {
  const matched = matchCountZeroCompare(expr);
  if (matched === null) {
    return null;
  }
  const isArray = callExpr('is_array', [refArg(matched.subject)]);
  const proof = proveTrueProof(isArray, env);
  if (proof === null) {
    return null;
  }
  const after = binExpr(
    matched.eqZero ? '===' : '!==',
    refArg(matched.subject),
    literalArg('[]'),
  );
  if (equals(expr, after)) {
    return null;
  }
  if (ctx === undefined) {
    return { expr: after, pos };
  }
  const children = proveProofToChildren(isArray, boolLit(true), proof);
  const rewrite = exprRewrite(
    'facts.normalize.countEmpty',
    expr,
    after,
    children,
  );
  const nextPos = commitReason(ctx, pos, rewrite.reason, host.current);
  host.apply(expr, after);
  return { expr: after, pos: nextPos };
}
