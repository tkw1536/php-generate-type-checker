import type { Block, CheckerIR, CheckerProgram, Stmt } from '../ir/types.ts';
import { blockEquals } from '../ir/equals.ts';
import { combine } from './combine.ts';
import { dedupe } from './dedupe.ts';
import { flatten } from './flatten.ts';
import { inlineBlock } from './inline.ts';
import { createOptimizerParams, type OptimizerParams } from './params.ts';
import { prunePrograms } from './prune.ts';
import { dce } from './dce.ts';
import { applyKnownFacts } from './knownFacts.ts';
import { unnest } from './unnest.ts';
import { emptyFactEnv } from './knownFacts.env.ts';
import { OptimizerStatsCollector } from './statsCollector.ts';
import type { OptimizeWithStatsResult } from './statsTypes.ts';

export function optimize(ir: CheckerIR): CheckerIR {
  return optimizeWithStats(ir).ir;
}

export function optimizeWithStats(ir: CheckerIR): OptimizeWithStatsResult {
  const params = createOptimizerParams(ir);
  const stats = new OptimizerStatsCollector();
  let current: CheckerIR = {
    order: [...ir.order],
    programs: { ...ir.programs },
    entries: [...ir.entries],
  };

  for (let iter = 0; iter < params.maxOptimizationLoops; iter++) {
    stats.bumpOuterLoop();
    const nextPrograms: Record<string, CheckerProgram> = {};
    let changed = false;

    for (const name of [...current.order].toReversed()) {
      const program = current.programs[name];
      const nextBody = optimizeBlock(
        program.body,
        current,
        name,
        params,
        stats,
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
    if (!changed) {
      break;
    }
  }

  return {
    ir: stats.trackPrune(current, (next) => prunePrograms(next, params)),
    stats: stats.snapshot(),
  };
}

function runPhases(
  block: Block,
  params: OptimizerParams,
  stats: Readonly<OptimizerStatsCollector>,
): Block {
  let b = stats.trackBlockPass('dedupe', block, (x) => dedupe(x));
  b = stats.trackBlockPass('unnest', b, (x) => unnest(x));
  b = stats.trackBlockPass('combine', b, (x) => combine(x));
  b = stats.trackBlockPass('flatten', b, (x) => flatten(x));
  b = stats.trackBlockPass('facts', b, (x) => applyKnownFacts(x, emptyFactEnv()));
  b = stats.trackSimplify(b, params);
  b = stats.trackBlockPass('dce', b, (x) => dce(x));
  return b;
}

function optimizeBlock(
  block: Block,
  ir: CheckerIR,
  programName: string,
  params: OptimizerParams,
  stats: Readonly<OptimizerStatsCollector>,
): Block {
  let current: Block = block.map((s) =>
    optimizeStmt(s, ir, programName, params, stats),
  );

  for (let iter = 0; iter < params.maxOptimizationLoops; iter++) {
    stats.bumpBlockLoop();
    const inlined = stats.trackBlockPass('inline', current, (x) =>
      inlineBlock(x, ir, programName),
    );
    const next = runPhases(inlined, params, stats);
    if (blockEquals(current, next)) {
      return next;
    }
    current = next;
  }

  return current;
}

function optimizeStmt(
  stmt: Stmt,
  ir: CheckerIR,
  programName: string,
  params: OptimizerParams,
  stats: Readonly<OptimizerStatsCollector>,
): Stmt {
  switch (stmt.kind) {
    case 'if':
      return {
        ...stmt,
        body: optimizeBlock(stmt.body, ir, programName, params, stats),
      };
    case 'foreach':
      return {
        ...stmt,
        body: optimizeBlock(stmt.body, ir, programName, params, stats),
      };
    case 'return':
      return stmt;
    default:
      throw new Error('never reached');
  }
}
