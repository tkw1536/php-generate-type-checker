import type { Block, CheckerIR, CheckerProgram, Stmt } from '../ir/types.ts';
import { blockEquals } from '../ir/equals.ts';
import { assignTempNames } from '../render/refs.ts';
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
  trace.bind(ctx);

  const initial = cloneIr(ir);
  let current = cloneIr(ir);
  current = runOuterFixpoint(current, ctx);
  ctx.setProgram('(prune)');
  ctx.setBlockLoop(0);
  const pruned = runIrPass(prunePass, current, ctx);
  return {
    ir: pruned,
    stats: stats.snapshot(),
    trace: trace.finalize(initial),
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
  for (let iter = 0; iter < ctx.params.maxOptimizationLoops; iter++) {
    ctx.stats.bumpOuterLoop();
    ctx.setOuterLoop(iter + 1);
    const nextPrograms: Record<string, CheckerProgram> = {};
    let changed = false;

    for (const name of [...current.order].toReversed()) {
      const program = current.programs[name];
      ctx.setIr(current);
      ctx.setProgram(name);
      ctx.setTempNames(assignTempNames(program));
      const nextBody = optimizeBlock(program.body, ctx);
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

function runPhases(block: Block, ctx: Readonly<OptimizeContext>): Block {
  let b = block;
  for (const pass of BLOCK_PHASES) {
    b = runBlockPass(pass, b, ctx);
  }
  return b;
}

function optimizeBlock(block: Block, ctx: Readonly<OptimizeContext>): Block {
  ctx.pushEnclosingBlock(block);
  try {
    let current: Block = block.map((s) => optimizeStmt(s, ctx));
    ctx.replaceTopEnclosingBlock(current);

    for (let iter = 0; iter < ctx.params.maxOptimizationLoops; iter++) {
      ctx.stats.bumpBlockLoop();
      ctx.setBlockLoop(iter + 1);
      ctx.replaceTopEnclosingBlock(current);
      const inlined = runBlockPass(inlinePass, current, ctx);
      const next = runPhases(inlined, ctx);
      if (blockEquals(current, next)) {
        return next;
      }
      current = next;
    }

    ctx.stats.noteBlockFixpointCapped();
    return current;
  } finally {
    ctx.popEnclosingBlock();
  }
}

function optimizeStmt(stmt: Stmt, ctx: Readonly<OptimizeContext>): Stmt {
  switch (stmt.kind) {
    case 'if':
      return {
        ...stmt,
        body: optimizeBlock(stmt.body, ctx),
      };
    case 'foreach':
      return {
        ...stmt,
        body: optimizeBlock(stmt.body, ctx),
      };
    case 'return':
      return stmt;
    default:
      throw new Error('never reached');
  }
}
