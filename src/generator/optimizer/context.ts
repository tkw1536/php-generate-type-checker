import type { Block, CheckerIR } from '../ir/types.ts';
import type { OptimizerParams } from './params.ts';
import type { StatsCollector } from './stats/collector.ts';
import type { TraceCollector } from './trace/collector.ts';

/** Mutable run state threaded through every pass. */
export class OptimizeContext {
  readonly params: OptimizerParams;
  readonly stats: Readonly<StatsCollector>;
  readonly trace: Readonly<TraceCollector>;
  #ir: CheckerIR;
  #program = '';
  #outerLoop = 0;
  #blockLoop = 0;
  #tempNames: ReadonlyMap<number, string> | null = null;
  /** Stack of blocks currently being rewritten (innermost last). */
  readonly #enclosingBlocks: Block[] = [];

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

  get tempNames(): ReadonlyMap<number, string> | null {
    return this.#tempNames;
  }

  /** Innermost enclosing block, if any. */
  get enclosingBlock(): Block | null {
    return this.#enclosingBlocks.at(-1) ?? null;
  }

  /** Outermost enclosing block (current checker body under optimize). */
  get enclosingRoot(): Block | null {
    return this.#enclosingBlocks[0] ?? null;
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

  setTempNames(names: ReadonlyMap<number, string> | null): void {
    this.#tempNames = names;
  }

  pushEnclosingBlock(block: Block): void {
    this.#enclosingBlocks.push(block);
  }

  popEnclosingBlock(): void {
    this.#enclosingBlocks.pop();
  }

  /** Replace the innermost enclosing block (e.g. after a block-loop step). */
  replaceTopEnclosingBlock(block: Block): void {
    if (this.#enclosingBlocks.length === 0) {
      throw new Error('no enclosing block to replace');
    }
    this.#enclosingBlocks[this.#enclosingBlocks.length - 1] = block;
  }

  /**
   * Rewrite every enclosing frame in place (outermost first) so later trace
   * records see prior rewrites from the same pass.
   */
  mapEnclosingBlocks(fn: (block: Block) => Block): void {
    for (let i = 0; i < this.#enclosingBlocks.length; i++) {
      this.#enclosingBlocks[i] = fn(this.#enclosingBlocks[i]);
    }
  }
}
