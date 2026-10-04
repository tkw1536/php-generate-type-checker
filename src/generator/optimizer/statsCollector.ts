import type { Block, CheckerIR } from '../ir/types.ts';
import { blockEquals } from '../ir/equals.ts';
import { simplify } from './expression.ts';
import type { OptimizerParams } from './params.ts';
import type {
  OptimizerPassName,
  OptimizerPassStats,
  OptimizerStats,
  PassStats,
  SimplifyPhaseStats,
} from './statsTypes.ts';

type MutablePassStats = {
  calls: number;
  changed: number;
};

type MutablePhaseStats = {
  calls: number;
  changed: number;
  maxPasses: number;
  sumPasses: number;
};

function emptyPassStats(): MutablePassStats {
  return { calls: 0, changed: 0 };
}

function emptyPassBuckets(): Record<OptimizerPassName, MutablePassStats> {
  return {
    inline: emptyPassStats(),
    dedupe: emptyPassStats(),
    unnest: emptyPassStats(),
    combine: emptyPassStats(),
    flatten: emptyPassStats(),
    facts: emptyPassStats(),
    simplify: emptyPassStats(),
    dce: emptyPassStats(),
    prune: emptyPassStats(),
  };
}

function emptyPhaseStats(): MutablePhaseStats {
  return { calls: 0, changed: 0, maxPasses: 0, sumPasses: 0 };
}

function freezePass(pass: Readonly<MutablePassStats>): PassStats {
  return { calls: pass.calls, changed: pass.changed };
}

function freezePhase(
  phase: Readonly<MutablePhaseStats>,
): SimplifyPhaseStats {
  return {
    calls: phase.calls,
    changed: phase.changed,
    maxPasses: phase.maxPasses,
    sumPasses: phase.sumPasses,
  };
}

function freezePasses(passes: {
  readonly [K in OptimizerPassName]: Readonly<MutablePassStats>;
}): OptimizerPassStats {
  return {
    inline: freezePass(passes.inline),
    dedupe: freezePass(passes.dedupe),
    unnest: freezePass(passes.unnest),
    combine: freezePass(passes.combine),
    flatten: freezePass(passes.flatten),
    facts: freezePass(passes.facts),
    simplify: freezePass(passes.simplify),
    dce: freezePass(passes.dce),
    prune: freezePass(passes.prune),
  };
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

/** Mutable accumulator for one {@link optimizeWithStats} run. */
export class OptimizerStatsCollector {
  private readonly passStats = emptyPassBuckets();
  private readonly simplifyStats = emptyPhaseStats();
  private outerLoops = 0;
  private blockLoops = 0;

  bumpOuterLoop(): void {
    this.outerLoops++;
  }

  bumpBlockLoop(): void {
    this.blockLoops++;
  }

  trackBlockPass(
    name: Exclude<OptimizerPassName, 'prune'>,
    block: Block,
    run: (block: Block) => Block,
  ): Block {
    const bucket = this.passStats[name];
    bucket.calls++;
    const next = run(block);
    if (!blockEquals(block, next)) {
      bucket.changed++;
    }
    return next;
  }

  trackPrune(ir: CheckerIR, run: (ir: CheckerIR) => CheckerIR): CheckerIR {
    const bucket = this.passStats.prune;
    bucket.calls++;
    const next = run(ir);
    if (!irEquals(ir, next)) {
      bucket.changed++;
    }
    return next;
  }

  trackSimplify(block: Block, params: OptimizerParams): Block {
    const rich = this.simplifyStats;
    const pass = this.passStats.simplify;
    rich.calls++;
    pass.calls++;

    let current = block;
    let transformingPasses = 0;
    for (let i = 0; i < params.maxOptimizationLoops; i++) {
      const next = simplify(current, params);
      if (blockEquals(current, next)) {
        break;
      }
      transformingPasses++;
      current = next;
    }

    if (transformingPasses > 0) {
      rich.changed++;
      pass.changed++;
      rich.sumPasses += transformingPasses;
      if (transformingPasses > rich.maxPasses) {
        rich.maxPasses = transformingPasses;
      }
    }
    return current;
  }

  snapshot(): OptimizerStats {
    return {
      passes: freezePasses(this.passStats),
      simplify: freezePhase(this.simplifyStats),
      outerOptimizeLoops: this.outerLoops,
      blockOptimizeLoops: this.blockLoops,
    };
  }
}
