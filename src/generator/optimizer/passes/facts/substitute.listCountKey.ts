/**
 * List/count key_exists folds — theory rewrite table.
 */
import type { Expr } from '../../../ir/types.ts';
import type { OptimizeContext } from '../../context.ts';
import type { TracePos } from '../../trace/types.ts';
import { applyFactRewrites } from '../../theory/rewrite.ts';
import { LIST_COUNT_KEY_REWRITES } from '../../theory/rewrites/listCountKey.ts';
import type { FactEnv } from './env.types.ts';
import type { HostCursor } from './substitute.absorb.ts';

export function normalizeListCountKeyExists(
  expr: Expr,
  env: FactEnv,
  ctx: Readonly<OptimizeContext> | undefined,
  pos: TracePos,
  host: HostCursor,
): { readonly expr: Expr; readonly pos: TracePos } | null {
  return applyFactRewrites(
    expr,
    env,
    ctx,
    pos,
    host,
    LIST_COUNT_KEY_REWRITES.filter(
      (r) => r.id === 'facts.normalize.listCountKeyExists',
    ),
  );
}

export function normalizeListNonEmptyKey0(
  expr: Expr,
  env: FactEnv,
  ctx: Readonly<OptimizeContext> | undefined,
  pos: TracePos,
  host: HostCursor,
): { readonly expr: Expr; readonly pos: TracePos } | null {
  return applyFactRewrites(
    expr,
    env,
    ctx,
    pos,
    host,
    LIST_COUNT_KEY_REWRITES.filter(
      (r) => r.id === 'facts.normalize.listNonEmptyKey0',
    ),
  );
}
