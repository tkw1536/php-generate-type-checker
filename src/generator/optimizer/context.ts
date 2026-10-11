import type { CheckerIR } from '../ir/types.ts';
import type { OptimizerParams } from './params.ts';
import type { StatsCollector } from './stats/collector.ts';
import type { TraceCollector } from './trace/collector.ts';
import type { TraceMeta } from './trace/types.ts';

/** Run handle: params, stats, and step log — no mutable IR frames. */
export class OptimizeContext {
  readonly params: OptimizerParams;
  readonly stats: Readonly<StatsCollector>;
  readonly trace: Readonly<TraceCollector>;
  #ir: CheckerIR;
  #program = '';
  #outerLoop = 0;
  #blockLoop = 0;

  constructor(
    params: OptimizerParams,
    ir: CheckerIR,
    stats: Readonly<StatsCollector>,
    trace: Readonly<TraceCollector>,
  ) {
    this.params = params;
    this.#ir = ir;
    this.stats = stats;
    this.trace = trace;
  }

  get ir(): CheckerIR {
    return this.#ir;
  }

  get program(): string {
    return this.#program;
  }

  get outerLoop(): number {
    return this.#outerLoop;
  }

  get blockLoop(): number {
    return this.#blockLoop;
  }

  meta(): TraceMeta {
    return {
      program: this.#program,
      outerLoop: this.#outerLoop,
      blockLoop: this.#blockLoop,
    };
  }

  setIr(ir: CheckerIR): void {
    this.#ir = ir;
  }

  setProgram(program: string): void {
    this.#program = program;
  }

  setOuterLoop(n: number): void {
    this.#outerLoop = n;
  }

  setBlockLoop(n: number): void {
    this.#blockLoop = n;
  }
}
