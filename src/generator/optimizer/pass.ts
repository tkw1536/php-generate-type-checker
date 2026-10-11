import type { Block, CheckerIR } from '../ir/types.ts';
import { blockEquals } from '../ir/equals.ts';
import type { OptimizeContext } from './context.ts';
import type { OptimizerPassName } from './stats/types.ts';

export type BlockPass = {
  readonly id: Exclude<OptimizerPassName, 'prune'>;
  run(block: Block, ctx: Readonly<OptimizeContext>): Block;
};

export type IrPass = {
  readonly id: 'prune';
  run(ir: CheckerIR, ctx: Readonly<OptimizeContext>): CheckerIR;
};

export function runBlockPass(
  pass: BlockPass,
  block: Block,
  ctx: Readonly<OptimizeContext>,
): Block {
  // Keep the optimizeBlock frame aligned with the block this pass sees
  // (e.g. after inline expands a body) so checker snapshots stay accurate.
  if (ctx.enclosingBlock !== null) {
    ctx.replaceTopEnclosingBlock(block);
  }
  if (pass.id === 'simplify') {
    return pass.run(block, ctx);
  }
  ctx.stats.noteCall(pass.id);
  const next = pass.run(block, ctx);
  if (!blockEquals(block, next)) {
    ctx.stats.noteChanged(pass.id);
  }
  return next;
}

export function runIrPass(
  pass: IrPass,
  ir: CheckerIR,
  ctx: Readonly<OptimizeContext>,
): CheckerIR {
  ctx.stats.noteCall(pass.id);
  const next = pass.run(ir, ctx);
  if (!irEquals(ir, next)) {
    ctx.stats.noteChanged(pass.id);
  }
  return next;
}

function irEquals(a: Readonly<CheckerIR>, b: Readonly<CheckerIR>): boolean {
  if (a.order.length !== b.order.length) {
    return false;
  }
  for (let i = 0; i < a.order.length; i++) {
    if (a.order[i] !== b.order[i]) {
      return false;
    }
  }
  for (const name of a.order) {
    const left = a.programs[name];
    const right = b.programs[name];
    if (left === undefined || right === undefined) {
      return false;
    }
    if (!blockEquals(left.body, right.body)) {
      return false;
    }
  }
  return a.entries.length === b.entries.length;
}
