import type { Block, Expr } from '../../ir/types.ts';
import { returnStmt } from '../../ir/index.ts';
import {
  replaceExprInBlock,
  replaceExprInBlockInsideHost,
} from './replaceExpr.ts';
import type { OptimizeTraceSnapshot, TraceScopeSnapshot } from './types.ts';

export function exprApply(
  before: Expr,
  after: Expr,
  within: Expr | undefined,
): (block: Block) => Block {
  return (block) =>
    within === undefined
      ? replaceExprInBlock(block, before, after)
      : replaceExprInBlockInsideHost(block, within, before, after);
}

export function exprSnapshots(
  enclosing: Block | null,
  root: Block | null,
  before: Expr,
  after: Expr,
  apply: (block: Block) => Block,
  blockSnap: (block: Block) => TraceScopeSnapshot,
): {
  readonly focus: {
    readonly before: OptimizeTraceSnapshot;
    readonly after: OptimizeTraceSnapshot;
  };
  readonly scope: {
    readonly before: TraceScopeSnapshot;
    readonly after: TraceScopeSnapshot;
  };
  readonly checker: {
    readonly before: TraceScopeSnapshot;
    readonly after: TraceScopeSnapshot;
  };
} {
  const scopeBefore: TraceScopeSnapshot =
    enclosing === null
      ? blockSnap([returnStmt(before)])
      : blockSnap(enclosing);
  const scopeAfter: TraceScopeSnapshot =
    enclosing === null
      ? blockSnap([returnStmt(after)])
      : blockSnap(apply(enclosing));
  const checkerBefore: TraceScopeSnapshot =
    root === null ? scopeBefore : blockSnap(root);
  const checkerAfter: TraceScopeSnapshot =
    root === null ? scopeAfter : blockSnap(apply(root));
  return {
    focus: {
      before: { kind: 'expr', expr: before },
      after: { kind: 'expr', expr: after },
    },
    scope: { before: scopeBefore, after: scopeAfter },
    checker: { before: checkerBefore, after: checkerAfter },
  };
}
