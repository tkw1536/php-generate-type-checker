import type { Block, CheckerIR, CheckerProgram, Stmt } from '../ir/types.ts';
import { blockEquals } from '../ir/equals.ts';
import { OptimizeContext } from './context.ts';
import { createOptimizerParams } from './params.ts';
import { runBlockPass, runIrPass, type BlockPass } from './pass.ts';
import { combinePass } from './passes/combine.ts';
import { dcePass } from './passes/dce.ts';
import { dedupePass } from './passes/dedupe.ts';
import { factsPass } from './passes/facts/apply.ts';
import { flattenPass } from './passes/flatten.ts';
import { inlinePass } from './passes/inline.ts';
import { prunePass } from './passes/prune.ts';
import { simplifyPass } from './passes/simplify/block.ts';
import { unnestPass } from './passes/unnest.ts';
import { StatsCollector } from './stats/collector.ts';
import type { OptimizeResult } from './stats/types.ts';
import { TraceCollector } from './trace/collector.ts';
import { rootPos, syncScopeInChecker, withScope } from './trace/commit.ts';
import type { TracePos } from './trace/types.ts';

const BLOCK_PHASES: readonly BlockPass[] = [
  dedupePass,
  unnestPass,
  combinePass,
  flattenPass,
  factsPass,
  simplifyPass,
  dcePass,
];

export function runOptimize(ir: CheckerIR): OptimizeResult {
  const params = createOptimizerParams(ir);
  const stats = new StatsCollector();
  const trace = new TraceCollector();
  const ctx = new OptimizeContext(params, ir, stats, trace);

  const initial = cloneIr(ir);
  let current = cloneIr(ir);
  current = runOuterFixpoint(current, ctx);
  ctx.setProgram('(prune)');
  ctx.setBlockLoop(0);
  trace.beginIr('(prune)', current);
  const pruned = runIrPass(prunePass, current, ctx);
  return {
    ir: pruned,
    stats: stats.snapshot(),
    steps: trace.finalize(initial),
  };
}

function cloneIr(ir: CheckerIR): CheckerIR {
  return {
    order: [...ir.order],
    programs: { ...ir.programs },
    entries: [...ir.entries],
  };
}

function runOuterFixpoint(
  ir: CheckerIR,
  ctx: Readonly<OptimizeContext>,
): CheckerIR {
  let current = ir;
  let converged = false;
  const begun = new Set<string>();
  for (let iter = 0; iter < ctx.params.maxOptimizationLoops; iter++) {
    ctx.stats.bumpOuterLoop();
    ctx.setOuterLoop(iter + 1);
    const nextPrograms: Record<string, CheckerProgram> = {};
    let changed = false;

    for (const name of [...current.order].toReversed()) {
      const program = current.programs[name];
      ctx.setIr(current);
      ctx.setProgram(name);
      if (!begun.has(name)) {
        ctx.trace.beginProgram(name, program.body);
        begun.add(name);
      }
      const { block: nextBody } = optimizeBlock(
        program.body,
        ctx,
        rootPos(program.body),
      );
      nextPrograms[name] = { ...program, body: nextBody };
      if (!blockEquals(program.body, nextBody)) {
        changed = true;
      }
    }

    current = {
      order: [...current.order],
      programs: nextPrograms,
      entries: [...current.entries],
    };
    ctx.setIr(current);
    if (!changed) {
      converged = true;
      break;
    }
  }
  if (!converged) {
    ctx.stats.noteOuterFixpointCapped();
  }
  return current;
}

function runPhases(
  block: Block,
  ctx: Readonly<OptimizeContext>,
  pos: TracePos,
): { readonly block: Block; readonly pos: TracePos } {
  let b = block;
  let p = pos;
  for (const pass of BLOCK_PHASES) {
    const next = runBlockPass(pass, b, ctx, withScope(p, b));
    b = next.block;
    p = next.pos;
  }
  return { block: b, pos: p };
}

function optimizeBlock(
  block: Block,
  ctx: Readonly<OptimizeContext>,
  pos: TracePos,
): { readonly block: Block; readonly pos: TracePos } {
  let currentPos = withScope(pos, block);
  const out: Stmt[] = [];
  for (const stmt of block) {
    const next = optimizeStmt(stmt, ctx, currentPos);
    out.push(next.stmt);
    currentPos = next.pos;
  }
  let current: Block = out;
  currentPos = syncScopeInChecker(currentPos, block, current);

  for (let iter = 0; iter < ctx.params.maxOptimizationLoops; iter++) {
    ctx.stats.bumpBlockLoop();
    ctx.setBlockLoop(iter + 1);
    const inlined = runBlockPass(
      inlinePass,
      current,
      ctx,
      withScope(currentPos, current),
    );
    const next = runPhases(inlined.block, ctx, inlined.pos);
    if (blockEquals(current, next.block)) {
      return next;
    }
    current = next.block;
    currentPos = next.pos;
  }

  ctx.stats.noteBlockFixpointCapped();
  return { block: current, pos: currentPos };
}

function optimizeStmt(
  stmt: Stmt,
  ctx: Readonly<OptimizeContext>,
  pos: TracePos,
): { readonly stmt: Stmt; readonly pos: TracePos } {
  switch (stmt.kind) {
    case 'if': {
      const nested = optimizeBlock(stmt.body, ctx, pos);
      return {
        stmt: { ...stmt, body: nested.block },
        pos: nested.pos,
      };
    }
    case 'foreach': {
      const nested = optimizeBlock(stmt.body, ctx, pos);
      return {
        stmt: { ...stmt, body: nested.block },
        pos: nested.pos,
      };
    }
    case 'return':
      return { stmt, pos };
    default:
      throw new Error('never reached');
  }
}
