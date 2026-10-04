/**
 * Aggregate optimizeWithStats over generator fixture inputs (.IN).
 * Run from repo root: yarn report:optimizer-stats
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { parseCheckerInput } from '../../parser/parseInput.ts';
import { buildEntries, optimizeWithStats } from '../pipeline.ts';

const testdataDir = import.meta.dirname;

/** @param {string} line @returns {string} */
function trimLine(line) {
  return line.trim();
}

/** @param {string} line @returns {boolean} */
function isSourceLine(line) {
  return line.length > 0 && !line.startsWith('#');
}

/** @param {string} block @returns {string} */
function trimBlock(block) {
  return block.trim();
}

/** @param {string} block @returns {boolean} */
function isNonEmptyBlock(block) {
  return block.length > 0;
}

/** @param {string} inPath @returns {string[]} */
function readSources(inPath) {
  return readFileSync(inPath, 'utf8')
    .split('\n')
    .map((line) => trimLine(line))
    .filter((line) => isSourceLine(line));
}

/** @param {string} block @returns {string} */
function multilineInput(block) {
  const lines = block.split('\n');
  let start = 0;
  while (start < lines.length) {
    const line = lines[start];
    if (line !== undefined && trimLine(line).startsWith('#')) {
      start++;
      continue;
    }
    break;
  }
  return lines.slice(start).join('\n').trim();
}

/** @param {string} input @returns {boolean} */
function hasTypeContent(input) {
  return input
    .split('\n')
    .map((line) => trimLine(line))
    .some((line) => isSourceLine(line));
}

/**
 * Unique success-path inputs from generator fixtures (skips errors.IN;
 * skips duplicate output-mode copies of function.IN).
 * @returns {string[]}
 */
function collectInputs() {
  /** @type {Set<string>} */
  const inputs = new Set();
  const functionIn = path.join(testdataDir, 'function.IN');
  if (existsSync(functionIn)) {
    for (const input of readSources(functionIn)) {
      inputs.add(input);
    }
  }
  for (const name of [
    'docblock',
    'docblock_emit_aliases',
    'multi_comment',
    'verbose_phpdoc',
  ]) {
    const inPath = path.join(testdataDir, `${name}.IN`);
    if (!existsSync(inPath)) {
      continue;
    }
    const blocks = readFileSync(inPath, 'utf8')
      .split('\n---\n')
      .map((block) => trimBlock(block))
      .filter((block) => isNonEmptyBlock(block));
    for (const block of blocks) {
      const input = multilineInput(block);
      if (hasTypeContent(input)) {
        inputs.add(input);
      }
    }
  }
  /** @type {string[]} */
  const list = [];
  for (const input of inputs) {
    list.push(input);
  }
  list.sort((a, b) => a.localeCompare(b));
  return list;
}

class PhaseAgg {
  constructor() {
    this.calls = 0;
    this.changed = 0;
    this.sumPasses = 0;
    this.maxPasses = 0;
    this.casesChanged = 0;
    /** @type {Map<number, number>} */
    this.maxPassesHistogram = new Map();
  }

  /**
   * @param {{
   *   readonly calls: number;
   *   readonly changed: number;
   *   readonly sumPasses: number;
   *   readonly maxPasses: number;
   * }} phase
   */
  add(phase) {
    this.calls += phase.calls;
    this.changed += phase.changed;
    this.sumPasses += phase.sumPasses;
    if (phase.maxPasses > this.maxPasses) {
      this.maxPasses = phase.maxPasses;
    }
    if (phase.changed > 0) {
      this.casesChanged++;
    }
    const prev = this.maxPassesHistogram.get(phase.maxPasses) ?? 0;
    this.maxPassesHistogram.set(phase.maxPasses, prev + 1);
  }

  /** @returns {string} */
  histogramText() {
    /** @type {Array<[number, number]>} */
    const entries = [];
    for (const [passes, count] of this.maxPassesHistogram) {
      entries.push([passes, count]);
    }
    entries.sort(
      /**
       * @param {readonly [number, number]} left
       * @param {readonly [number, number]} right
       */
      (left, right) => left[0] - right[0],
    );
    /** @type {string[]} */
    const parts = [];
    for (const entry of entries) {
      parts.push(`${entry[0]}:${entry[1]}`);
    }
    return parts.join(', ');
  }

  /** @param {string} title @param {number} okCount */
  print(title, okCount) {
    console.log(`${title}:`);
    console.log(`  calls (sum):          ${this.calls}`);
    console.log(`  changed (sum):        ${this.changed}`);
    console.log(`  sumPasses:            ${this.sumPasses}`);
    console.log(`  maxPasses (global):   ${this.maxPasses}`);
    console.log(
      `  cases with changed>0: ${this.casesChanged} / ${okCount} (${pct(this.casesChanged, okCount)})`,
    );
    console.log(`  maxPasses histogram:  ${this.histogramText()}`);
  }
}

/** @param {number} n @param {number} d @returns {string} */
function pct(n, d) {
  return d === 0 ? 'n/a' : `${((100 * n) / d).toFixed(1)}%`;
}

const inputs = collectInputs();
const simplifyAgg = new PhaseAgg();
let inlineCalls = 0;
let inlineChanged = 0;
let dedupeCalls = 0;
let dedupeChanged = 0;
let unnestCalls = 0;
let unnestChanged = 0;
let combineCalls = 0;
let combineChanged = 0;
let flattenCalls = 0;
let flattenChanged = 0;
let factsCalls = 0;
let factsChanged = 0;
let simplifyPassCalls = 0;
let simplifyPassChanged = 0;
let dceCalls = 0;
let dceChanged = 0;
let pruneCalls = 0;
let pruneChanged = 0;
let ok = 0;
let skipped = 0;
let outerLoopsSum = 0;
let outerLoopsMax = 0;
let blockLoopsSum = 0;
let blockLoopsMax = 0;

for (const input of inputs) {
  try {
    const entries = parseCheckerInput(input);
    const { ir: built } = buildEntries(entries, {
      segmentSources: entries.map((e) => e.typeString),
    });
    const { stats } = optimizeWithStats(built);
    ok++;
    simplifyAgg.add(stats.simplify);
    inlineCalls += stats.passes.inline.calls;
    inlineChanged += stats.passes.inline.changed;
    dedupeCalls += stats.passes.dedupe.calls;
    dedupeChanged += stats.passes.dedupe.changed;
    unnestCalls += stats.passes.unnest.calls;
    unnestChanged += stats.passes.unnest.changed;
    combineCalls += stats.passes.combine.calls;
    combineChanged += stats.passes.combine.changed;
    flattenCalls += stats.passes.flatten.calls;
    flattenChanged += stats.passes.flatten.changed;
    factsCalls += stats.passes.facts.calls;
    factsChanged += stats.passes.facts.changed;
    simplifyPassCalls += stats.passes.simplify.calls;
    simplifyPassChanged += stats.passes.simplify.changed;
    dceCalls += stats.passes.dce.calls;
    dceChanged += stats.passes.dce.changed;
    pruneCalls += stats.passes.prune.calls;
    pruneChanged += stats.passes.prune.changed;
    outerLoopsSum += stats.outerOptimizeLoops;
    if (stats.outerOptimizeLoops > outerLoopsMax) {
      outerLoopsMax = stats.outerOptimizeLoops;
    }
    blockLoopsSum += stats.blockOptimizeLoops;
    if (stats.blockOptimizeLoops > blockLoopsMax) {
      blockLoopsMax = stats.blockOptimizeLoops;
    }
  } catch (err) {
    skipped++;
    const message = err instanceof Error ? err.message : String(err);
    console.warn('skip', JSON.stringify(input).slice(0, 60), message);
  }
}

console.log('Optimizer stats over generator fixtures');
console.log(`inputs: ${inputs.length}  ok: ${ok}  skipped: ${skipped}`);
simplifyAgg.print('Simplify', ok);
console.log('Passes (calls / changed sums):');
console.log(`  inline: ${inlineCalls} / ${inlineChanged}`);
console.log(`  dedupe: ${dedupeCalls} / ${dedupeChanged}`);
console.log(`  unnest: ${unnestCalls} / ${unnestChanged}`);
console.log(`  combine: ${combineCalls} / ${combineChanged}`);
console.log(`  flatten: ${flattenCalls} / ${flattenChanged}`);
console.log(`  facts: ${factsCalls} / ${factsChanged}`);
console.log(`  simplify: ${simplifyPassCalls} / ${simplifyPassChanged}`);
console.log(`  dce: ${dceCalls} / ${dceChanged}`);
console.log(`  prune: ${pruneCalls} / ${pruneChanged}`);
console.log(
  `Outer loops sum/max: ${outerLoopsSum}/${outerLoopsMax}; block loops sum/max: ${blockLoopsSum}/${blockLoopsMax}`,
);
