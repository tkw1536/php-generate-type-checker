import type { Block, CheckerIR, Expr } from '../../ir/types.ts';
import { blockEquals } from '../../ir/equals.ts';
import { returnStmt } from '../../ir/index.ts';
import type { OptimizeContext } from '../context.ts';
import {
  applyBlockRewrite,
  replaceExprInBlock,
  replaceExprInBlockInsideHost,
} from './replaceExpr.ts';
import { flattenReasons } from './rewrite.ts';
import type {
  TracePos,
  TraceReasoning,
  TraceScopeSnapshot,
  TraceStepReason,
} from './types.ts';

export function blockSnap(block: Block): TraceScopeSnapshot {
  return { kind: 'block', block };
}

export function irSnap(ir: CheckerIR): TraceScopeSnapshot {
  return { kind: 'ir', ir };
}

export function rootPos(body: Block): TracePos {
  return { checker: body, scope: body };
}

export function withScope(pos: TracePos, scope: Block): TracePos {
  return { checker: pos.checker, scope };
}

/** Commit every step in `reason` (seq flattened); returns updated pos. */
export function commitReason(
  ctx: Readonly<OptimizeContext>,
  pos: TracePos,
  reason: TraceReasoning,
  within?: Expr,
): TracePos {
  let current = pos;
  for (const step of flattenReasons(reason)) {
    current = commitStep(ctx, current, step, within);
  }
  return current;
}

/**
 * Record a zero-diff `facts.env.extend` parent with env micro-step children.
 * Checker IR is unchanged.
 */
export function commitEnvExtend(
  ctx: Readonly<OptimizeContext>,
  pos: TracePos,
  children: readonly TraceReasoning[],
): void {
  if (children.length === 0) {
    return;
  }
  const snap = blockSnap(pos.checker);
  const scope = blockSnap(pos.scope);
  ctx.trace.commit(ctx.meta(), {
    reason: {
      kind: 'step',
      rule: 'facts.env.extend',
      focus: {
        before: { kind: 'block', block: pos.scope },
        after: { kind: 'block', block: pos.scope },
      },
      children,
    },
    scope: { before: scope, after: scope },
    after: snap,
  });
}

function commitStep(
  ctx: Readonly<OptimizeContext>,
  pos: TracePos,
  reason: TraceStepReason,
  within?: Expr,
): TracePos {
  const focus = reason.focus;
  if (focus.before.kind === 'expr' && focus.after.kind === 'expr') {
    return commitExprStep(
      ctx,
      pos,
      reason,
      focus.before.expr,
      focus.after.expr,
      within,
    );
  }
  if (focus.before.kind === 'block' && focus.after.kind === 'block') {
    return commitBlockStep(
      ctx,
      pos,
      reason,
      focus.before.block,
      focus.after.block,
    );
  }
  if (focus.before.kind === 'ir' && focus.after.kind === 'ir') {
    commitIrStep(ctx, reason, focus.before.ir, focus.after.ir);
    return pos;
  }
  throw new Error('never reached');
}

function commitExprStep(
  ctx: Readonly<OptimizeContext>,
  pos: TracePos,
  reason: TraceStepReason,
  before: Expr,
  after: Expr,
  within: Expr | undefined,
): TracePos {
  const apply = (block: Block): Block =>
    within === undefined
      ? replaceExprInBlock(block, before, after)
      : replaceExprInBlockInsideHost(block, within, before, after);

  const nextScope = apply(pos.scope);
  const nextChecker = apply(pos.checker);
  if (nextChecker === pos.checker) {
    return pos;
  }

  const next: TracePos = { checker: nextChecker, scope: nextScope };
  ctx.trace.commit(ctx.meta(), {
    reason,
    scope: { before: blockSnap(pos.scope), after: blockSnap(next.scope) },
    after: blockSnap(next.checker),
  });
  return next;
}

function commitBlockStep(
  ctx: Readonly<OptimizeContext>,
  pos: TracePos,
  reason: TraceStepReason,
  before: Block,
  after: Block,
): TracePos {
  const nextChecker = blockEquals(pos.checker, before)
    ? after
    : applyBlockRewrite(pos.checker, before, after);
  const nextScope = blockEquals(pos.scope, before)
    ? after
    : applyBlockRewrite(pos.scope, before, after);

  if (
    blockEquals(nextChecker, pos.checker) &&
    blockEquals(nextScope, pos.scope)
  ) {
    return pos;
  }

  const next: TracePos = { checker: nextChecker, scope: nextScope };
  ctx.trace.commit(ctx.meta(), {
    reason,
    scope: { before: blockSnap(before), after: blockSnap(after) },
    after: blockSnap(next.checker),
  });
  return next;
}

function commitIrStep(
  ctx: Readonly<OptimizeContext>,
  reason: TraceStepReason,
  _before: CheckerIR,
  after: CheckerIR,
): void {
  ctx.trace.commit(ctx.meta(), {
    reason,
    scope: {
      before: irSnap(_before),
      after: irSnap(after),
    },
    after: irSnap(after),
  });
}

/** Replace `oldScope` with `newScope` inside checker (after nested optimize). */
export function syncScopeInChecker(
  pos: TracePos,
  oldScope: Block,
  newScope: Block,
): TracePos {
  if (blockEquals(oldScope, newScope)) {
    return withScope(pos, newScope);
  }
  if (blockEquals(pos.checker, oldScope)) {
    return { checker: newScope, scope: newScope };
  }
  return {
    checker: applyBlockRewrite(pos.checker, oldScope, newScope),
    scope: newScope,
  };
}

/** Synthetic pos for unit tests that rewrite a lone expression. */
export function exprTestPos(expr: Expr): TracePos {
  const block = [returnStmt(expr)];
  return { checker: block, scope: block };
}
