import type { CheckerIR } from '../ir/types.ts';
import { collectCallCheckerNames } from '../ir/substitute.ts';
import type { OptimizerParams } from './params.ts';

export function prunePrograms(
  ir: CheckerIR,
  params: OptimizerParams,
): CheckerIR {
  const referenced = new Set<string>();
  for (const program of Object.values(ir.programs)) {
    for (const name of collectCallCheckerNames(program.body)) {
      referenced.add(name);
    }
  }

  const keep = new Set<string>(params.neverPrune);
  for (const name of referenced) {
    keep.add(name);
  }

  const programs: CheckerIR['programs'] = {};
  const order: string[] = [];
  for (const name of ir.order) {
    if (keep.has(name)) {
      order.push(name);
      programs[name] = ir.programs[name]!;
    }
  }

  return { order, programs };
}
