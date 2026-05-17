import type { Block, CheckerIR, Stmt } from '../ir/types.ts';
import { blockEquals } from '../ir/equals.ts';
import { combine } from './combine.ts';
import { dedupe } from './dedupe.ts';
import { simplify } from './expression.ts';
import { flatten } from './flatten.ts';
import { inlineBlock } from './inline.ts';
import { createOptimizerParams, type OptimizerParams } from './params.ts';
import { prunePrograms } from './prune.ts';
import { reorder } from './reorder.ts';
import { unnest } from './unnest.ts';

export function optimize(ir: CheckerIR): CheckerIR {
  const params = createOptimizerParams(ir);
  let current: CheckerIR = {
    order: [...ir.order],
    programs: { ...ir.programs },
  };

  for (let iter = 0; iter < params.maxOptimizationLoops; iter++) {
    const nextPrograms: CheckerIR['programs'] = {};
    let changed = false;

    for (const name of [...current.order].reverse()) {
      const program = current.programs[name]!;
      const nextBody = optimizeBlock(program.body, current, name, params);
      nextPrograms[name] = { ...program, body: nextBody };
      if (!blockEquals(program.body, nextBody)) {
        changed = true;
      }
    }

    current = { order: [...current.order], programs: nextPrograms };
    if (!changed) {
      break;
    }
  }

  return prunePrograms(current, params);
}

function runPhases(block: Block, params: OptimizerParams): Block {
  const phased = flatten(combine(unnest(dedupe(reorder(block)))));
  return simplify(phased, params);
}

function optimizeBlock(
  block: Block,
  ir: CheckerIR,
  programName: string,
  params: OptimizerParams,
): Block {
  let current = block.map((s) => optimizeStmt(s, ir, programName, params));

  for (let iter = 0; iter < params.maxOptimizationLoops; iter++) {
    const inlined = inlineBlock(current, ir, programName);
    const next = runPhases(inlined, params);
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
): Stmt {
  switch (stmt.kind) {
    case 'if':
      return {
        ...stmt,
        body: optimizeBlock(stmt.body, ir, programName, params),
      };
    case 'foreach':
      return {
        ...stmt,
        body: optimizeBlock(stmt.body, ir, programName, params),
      };
    default:
      return stmt;
  }
}
