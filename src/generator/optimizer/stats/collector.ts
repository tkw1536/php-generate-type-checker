import type {
  OptimizerPassName,
  OptimizerPassStats,
  OptimizerStats,
  PassStats,
  SimplifyPhaseStats,
} from './types.ts';

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

/** Mutable aggregate counters for one {@link optimize} run. */
export class StatsCollector {
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

  noteCall(name: OptimizerPassName): void {
    this.passStats[name].calls++;
  }

  noteChanged(name: OptimizerPassName): void {
    this.passStats[name].changed++;
  }

  /** One simplify-pass invocation; `transformingPasses` = inner fixpoint rounds that changed. */
  noteSimplifyCall(transformingPasses: number): void {
    const rich = this.simplifyStats;
    const pass = this.passStats.simplify;
    rich.calls++;
    pass.calls++;
    if (transformingPasses > 0) {
      rich.changed++;
      pass.changed++;
      rich.sumPasses += transformingPasses;
      if (transformingPasses > rich.maxPasses) {
        rich.maxPasses = transformingPasses;
      }
    }
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
