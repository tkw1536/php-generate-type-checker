import type { Block, Expr, Stmt } from '../../ir/types.ts';
import { blockEquals, valueRefEquals } from '../../ir/equals.ts';
import { orExpr } from '../../ir/index.ts';
import { remapBlockVars } from '../../ir/remapVars.ts';
import type { OptimizeContext } from '../context.ts';
import type { BlockPass, BlockPassResult } from '../pass.ts';
import { commitReason } from '../trace/commit.ts';
import { blockStep } from '../trace/rewrite.ts';
import type { TracePos } from '../trace/types.ts';

type ForeachStmt = Extract<Stmt, { kind: 'foreach' }>;

/** True when every return in the block is `return false` (nested if/foreach). */
function blockOnlyReturnsFalse(block: Block): boolean {
  for (const stmt of block) {
    switch (stmt.kind) {
      case 'if':
        if (!blockOnlyReturnsFalse(stmt.body)) {
          return false;
        }
        break;
      case 'foreach':
        if (!blockOnlyReturnsFalse(stmt.body)) {
          return false;
        }
        break;
      case 'return':
        if (stmt.expr.kind !== 'bool' || stmt.expr.value) {
          return false;
        }
        break;
      default:
        throw new Error('never reached');
    }
  }
  return true;
}

function collectSameBodyIfs(
  block: Block,
  start: number,
): { readonly conds: readonly Expr[]; readonly end: number } {
  const stmt = block[start];
  if (stmt.kind !== 'if') {
    throw new Error('never reached');
  }
  const sharedBody = stmt.body;
  const conds = [stmt.cond];
  let j = start + 1;
  while (j < block.length) {
    const next = block[j];
    if (next.kind !== 'if' || !blockEquals(next.body, sharedBody)) {
      break;
    }
    conds.push(next.cond);
    j++;
  }
  return { conds, end: j };
}

function tryMergeIfs(
  block: Block,
  i: number,
  prefix: readonly Stmt[],
  ctx: Readonly<OptimizeContext> | undefined,
  currentPos: TracePos,
): { readonly stmt: Stmt; readonly end: number; readonly pos: TracePos } {
  const stmt = block[i];
  if (stmt.kind !== 'if') {
    throw new Error('never reached');
  }
  const { conds, end } = collectSameBodyIfs(block, i);
  if (conds.length === 1) {
    return { stmt, end, pos: currentPos };
  }
  const merged: Stmt = {
    kind: 'if',
    cond: orExpr(conds),
    body: stmt.body,
  };
  let pos = currentPos;
  if (ctx !== undefined) {
    const before = [...prefix, ...block.slice(i)];
    const after = [...prefix, merged, ...block.slice(end)];
    pos = commitReason(ctx, currentPos, blockStep('combine.merge', before, after));
  }
  return { stmt: merged, end, pos };
}

function mergeForeachBinders(
  first: ForeachStmt,
  later: ForeachStmt,
): {
  readonly keyVar: number | null;
  readonly map: ReadonlyMap<number, number>;
} {
  const entries: [number, number][] = [[later.valueVar, first.valueVar]];
  let keyVar = first.keyVar;
  if (first.keyVar !== null && later.keyVar !== null) {
    entries.push([later.keyVar, first.keyVar]);
  } else if (first.keyVar === null && later.keyVar !== null) {
    keyVar = later.keyVar;
  }
  return { keyVar, map: new Map(entries) };
}

function collectMergeableForeachLoops(
  block: Block,
  start: number,
): { readonly loops: readonly ForeachStmt[]; readonly end: number } {
  const first = block[start];
  if (first.kind !== 'foreach') {
    throw new Error('never reached');
  }
  if (!blockOnlyReturnsFalse(first.body)) {
    return { loops: [first], end: start + 1 };
  }
  const loops: ForeachStmt[] = [first];
  let j = start + 1;
  while (j < block.length) {
    const next = block[j];
    if (
      next.kind !== 'foreach' ||
      !valueRefEquals(next.iterable, first.iterable) ||
      !blockOnlyReturnsFalse(next.body)
    ) {
      break;
    }
    loops.push(next);
    j++;
  }
  return { loops, end: j };
}

function buildMergedForeach(loops: readonly ForeachStmt[]): ForeachStmt {
  const first = loops[0];
  let keyVar = first.keyVar;
  const bodyParts: Stmt[] = [...first.body];
  let binders: ForeachStmt = first;
  for (let k = 1; k < loops.length; k++) {
    const later = loops[k];
    const merged = mergeForeachBinders(binders, later);
    keyVar = merged.keyVar;
    bodyParts.push(...remapBlockVars(later.body, merged.map));
    binders = {
      kind: 'foreach',
      iterable: first.iterable,
      keyVar,
      valueVar: first.valueVar,
      body: bodyParts,
    };
  }
  return {
    kind: 'foreach',
    iterable: first.iterable,
    keyVar,
    valueVar: first.valueVar,
    body: bodyParts,
  };
}

function tryMergeForeachLoops(
  block: Block,
  i: number,
  prefix: readonly Stmt[],
  ctx: Readonly<OptimizeContext> | undefined,
  currentPos: TracePos,
): { readonly stmt: Stmt; readonly end: number; readonly pos: TracePos } {
  const { loops, end } = collectMergeableForeachLoops(block, i);
  if (loops.length === 1) {
    return { stmt: loops[0], end, pos: currentPos };
  }
  const merged = buildMergedForeach(loops);
  let pos = currentPos;
  if (ctx !== undefined) {
    const before = [...prefix, ...block.slice(i)];
    const after = [...prefix, merged, ...block.slice(end)];
    pos = commitReason(
      ctx,
      currentPos,
      blockStep('combine.mergeForeach', before, after),
    );
  }
  return { stmt: merged, end, pos };
}

export function combine(
  block: Block,
  ctx?: Readonly<OptimizeContext>,
  pos?: TracePos,
): BlockPassResult {
  let currentPos = pos ?? { checker: block, scope: block };
  const out: Stmt[] = [];
  let i = 0;
  while (i < block.length) {
    const stmt = block[i];
    if (stmt.kind === 'if') {
      const result = tryMergeIfs(block, i, out, ctx, currentPos);
      out.push(result.stmt);
      currentPos = result.pos;
      i = result.end;
      continue;
    }
    if (stmt.kind === 'foreach') {
      const result = tryMergeForeachLoops(block, i, out, ctx, currentPos);
      out.push(result.stmt);
      currentPos = result.pos;
      i = result.end;
      continue;
    }
    out.push(stmt);
    i++;
  }
  return { block: out, pos: currentPos };
}

export const combinePass: BlockPass = {
  id: 'combine',
  run(block, ctx, pos) {
    return combine(block, ctx, pos);
  },
};
