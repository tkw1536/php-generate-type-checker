/**
 * count($x)===0 → $x===[] under known is_array — theory rewrite table.
 */
import type { Expr } from '../../../ir/types.ts';
import type { OptimizeContext } from '../../context.ts';
import type { TracePos } from '../../trace/types.ts';
import { applyFactRewrites } from '../../theory/rewrite.ts';
import { COUNT_EMPTY_REWRITES } from '../../theory/rewrites/countEmpty.ts';
import type { FactEnv } from './env.types.ts';
import type { HostCursor } from './substitute.absorb.ts';

export function normalizeCountEmpty(
  expr: Expr,
  env: FactEnv,
  ctx: Readonly<OptimizeContext> | undefined,
  pos: TracePos,
  host: HostCursor,
): { readonly expr: Expr; readonly pos: TracePos } | null {
  return applyFactRewrites(expr, env, ctx, pos, host, COUNT_EMPTY_REWRITES);
}
