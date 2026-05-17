import type { Block, CheckerIR, Stmt } from '../ir/types.ts';
import { combine } from './combine.ts';
import { dedupe } from './dedupe.ts';
import { simplify } from './expression.ts';
import { flatten } from './flatten.ts';
import { reorder } from './reorder.ts';
import { unnest } from './unnest.ts';

export function optimize(ir: CheckerIR): CheckerIR {
  const programs: CheckerIR['programs'] = {};
  for (const name of Object.keys(ir.programs)) {
    const program = ir.programs[name]!;
    programs[name] = {
      ...program,
      body: optimizeBlock(program.body),
    };
  }
  return { order: [...ir.order], programs };
}

function optimizeBlock(block: Block): Block {
  const stmts = block.map((s) => optimizeStmt(s));
  const phased = flatten(combine(unnest(dedupe(reorder(stmts)))));
  return simplify(phased);
}

function optimizeStmt(stmt: Stmt): Stmt {
  switch (stmt.kind) {
    case 'if':
      return { ...stmt, body: optimizeBlock(stmt.body) };
    case 'foreach':
      return { ...stmt, body: optimizeBlock(stmt.body) };
    default:
      return stmt;
  }
}
