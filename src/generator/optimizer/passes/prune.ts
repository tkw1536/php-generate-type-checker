import type { CheckerIR, CheckerProgram } from '../../ir/types.ts';
import { collectCallCheckerNames } from '../../ir/substitute.ts';
import type { OptimizeContext } from '../context.ts';
import type { IrPass } from '../pass.ts';
import type { OptimizerParams } from '../params.ts';
import { commitReason } from '../trace/commit.ts';
import type { TraceStepReason } from '../trace/types.ts';

function pruneStep(
  before: CheckerIR,
  after: CheckerIR,
  removed: string,
): TraceStepReason {
  return {
    kind: 'step',
    rule: 'prune.remove',
    focus: {
      before: { kind: 'ir', ir: before },
      after: { kind: 'ir', ir: after },
    },
    children: [],
    evidence: { kind: 'prune', removed },
  };
}

export function prunePrograms(
  ir: CheckerIR,
  params: OptimizerParams,
  ctx?: Readonly<OptimizeContext>,
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

  let current = ir;
  for (const name of ir.order) {
    if (keep.has(name)) {
      continue;
    }
    const before = current;
    current = removeProgram(current, name);
    if (ctx !== undefined) {
      // IR commits ignore TracePos; pass a dummy pos.
      commitReason(
        ctx,
        { checker: [], scope: [] },
        pruneStep(before, current, name),
      );
    }
  }
  return current;
}

function removeProgram(ir: CheckerIR, name: string): CheckerIR {
  const programs: Record<string, CheckerProgram> = {};
  const order: string[] = [];
  for (const n of ir.order) {
    if (n === name) {
      continue;
    }
    order.push(n);
    programs[n] = ir.programs[n]!;
  }
  return {
    order,
    programs,
    entries: ir.entries.filter((n) => n !== name),
  };
}

export const prunePass: IrPass = {
  id: 'prune',
  run(ir, ctx) {
    return prunePrograms(ir, ctx.params, ctx);
  },
};
