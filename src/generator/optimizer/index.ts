import type { Block, CheckerIR, CheckerProgram, Stmt } from '../ir/types.ts';
import { blockEquals } from '../ir/equals.ts';
import { combine } from './combine.ts';
import { dedupe } from './dedupe.ts';
import { simplify } from './expression.ts';
import { flatten } from './flatten.ts';
import { inlineBlock } from './inline.ts';
import { createOptimizerParams, type OptimizerParams } from './params.ts';
import { prunePrograms } from './prune.ts';
import { dce } from './dce.ts';
import { applyKnownFacts } from './knownFacts.ts';
import { unnest } from './unnest.ts';
import { emptyFactEnv } from "./knownFacts.env.ts";

export function optimize(ir: CheckerIR): CheckerIR {
  const params = createOptimizerParams(ir);
  let current: CheckerIR = {
    order: [...ir.order],
    programs: { ...ir.programs },
    entries: [...ir.entries],
  };

  for (let iter = 0; iter < params.maxOptimizationLoops; iter++) {
    const nextPrograms: Record<string, CheckerProgram> = {};
    let changed = false;

    for (const name of [...current.order].toReversed()) {
      const program = current.programs[name];
      const nextBody = optimizeBlock(program.body, current, name, params);
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

  return prunePrograms(current, params);
}

function runPhases(
  block: Block,
  ir: CheckerIR,
  programName: string,
  params: OptimizerParams,
): Block {
  let b = flatten(combine(unnest(dedupe(block))));
  const program = ir.programs[programName];
  const parameter = program?.parameter ?? '$value';
  b = applyKnownFacts(b, parameter, emptyFactEnv());
  b = simplify(b, params);
  b = dce(b);
  b = simplify(b, params);
  return b;
}

function optimizeBlock(
  block: Block,
  ir: CheckerIR,
  programName: string,
  params: OptimizerParams,
): Block {
  let current: Block = block.map((s) => optimizeStmt(s, ir, programName, params));

  for (let iter = 0; iter < params.maxOptimizationLoops; iter++) {
    const inlined = inlineBlock(current, ir, programName);
    const next = runPhases(inlined, ir, programName, params);
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
    case 'return':
      return stmt;
    default:
      throw new Error('never reached');
  }
}
