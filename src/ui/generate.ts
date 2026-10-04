import {
  buildEntries,
  optimizeWithStats,
  renderChecker,
} from '../generator/pipeline.ts';
import type { BuildResult } from '../generator/pipeline.ts';
import type { CheckerIR } from '../generator/ir/types.ts';
import type { OptimizerStats } from '../generator/optimizer/statsTypes.ts';
import type { ParsedCheckerEntry } from '../parser/parseInput.ts';
import {
  hasPhpstanTypeAliases,
  parseCheckerInput,
} from '../parser/parseInput.ts';
import { TYPE_EXAMPLES } from './examples.ts';
import { readFragmentFromLocation } from './fragmentState.ts';
import {
  applyFragmentState,
  getEmitPhpstanTypeAliases,
  getGenerateOptions,
  getResolveAliases,
  getTypeInput,
  syncDocblockOptions,
  syncFragmentToLocation,
  wouldRunOptimizer,
} from './generateControls.ts';
import type { OutputPanelSet } from './outputPanel.ts';
import type { StageTimings } from './stageTimings.ts';

export const INPUT_DEBOUNCE_MS = 250;

function timedMs(run: () => void): number {
  const start = performance.now();
  run();
  return performance.now() - start;
}

function timedValue<T>(run: () => T): { readonly value: T; readonly ms: number } {
  const start = performance.now();
  const value = run();
  return { value, ms: performance.now() - start };
}

type ParseOk = {
  readonly ok: true;
  readonly entries: readonly ParsedCheckerEntry[];
};
type ParseFail = { readonly ok: false; readonly err: unknown };

function tryParseEntries(typeString: string): ParseOk | ParseFail {
  try {
    return {
      ok: true,
      entries: parseCheckerInput(typeString, {
        resolveAliases: getResolveAliases(),
      }),
    };
  } catch (err) {
    return { ok: false, err };
  }
}

type OptimizeStage = {
  readonly ir: CheckerIR;
  readonly ms: number;
  readonly ran: boolean;
  readonly stats: OptimizerStats | null;
};

function runOptimizeStage(ir: CheckerIR): OptimizeStage {
  if (!wouldRunOptimizer()) {
    return { ir, ms: 0, ran: false, stats: null };
  }
  const timed = timedValue(() => optimizeWithStats(ir));
  return {
    ir: timed.value.ir,
    ms: timed.ms,
    ran: true,
    stats: timed.value.stats,
  };
}

type PipelineResult = {
  readonly built: BuildResult;
  readonly irForPhp: CheckerIR;
  readonly php: string;
  readonly stageTimings: StageTimings;
  readonly optimizerStats: OptimizerStats | null;
};

function runTimedPipeline(
  entries: readonly ParsedCheckerEntry[],
  typeString: string,
): PipelineResult {
  const genOpts = getGenerateOptions();
  const buildTimed = timedValue(() =>
    buildEntries(entries, {
      ...genOpts,
      segmentSources: entries.map((e) => e.typeString),
    }),
  );
  const built = buildTimed.value;
  const optimize = runOptimizeStage(built.ir);
  let php = '';
  const renderMs = timedMs(() => {
    php = renderChecker(optimize.ir, {
      ...genOpts,
      typeString,
      typesByName: built.typesByName,
      docStringsByName: built.docStringsByName,
      emitPhpstanTypeAliases:
        hasPhpstanTypeAliases(entries) && getEmitPhpstanTypeAliases(),
      phpstanTypeAliases: built.phpstanTypeAliases,
    });
  });
  return {
    built,
    irForPhp: optimize.ir,
    php,
    optimizerStats: optimize.stats,
    stageTimings: {
      parseMs: 0,
      generateMs: buildTimed.ms,
      optimizeMs: optimize.ms,
      renderMs,
      optimizeRan: optimize.ran,
    },
  };
}

function publishParseError(
  panels: OutputPanelSet,
  err: unknown,
  typeString: string,
): void {
  syncDocblockOptions(false);
  panels.ast.setError(err, typeString);
  panels.irBuild.setError(err, typeString);
  panels.irOptimized.setError(err, typeString);
  panels.irMetrics.setError(err, typeString);
  panels.php.setError(err, typeString);
}

function publishAst(panels: OutputPanelSet, entries: readonly ParsedCheckerEntry[]): void {
  panels.ast.setSuccess(
    JSON.stringify(
      entries.map((entry) => ({
        aliasName: entry.aliasName,
        typeString: entry.typeString,
        functionName: entry.functionName,
        ast: entry.ast,
      })),
      null,
      2,
    ),
  );
}

function publishPipelineSuccess(
  panels: OutputPanelSet,
  result: PipelineResult,
  parseMs: number,
): void {
  panels.irBuild.setSuccess(JSON.stringify(result.built.ir, null, 2));
  if (result.stageTimings.optimizeRan) {
    panels.irOptimized.setSuccess(JSON.stringify(result.irForPhp, null, 2));
  } else {
    panels.irOptimized.setSuccess(
      'Optimizer skipped (Optimize is off).\nIR (optimized) matches IR (build).',
    );
  }
  panels.php.setSuccess(result.php);
  panels.irMetrics.setReport(
    { ...result.stageTimings, parseMs },
    result.optimizerStats,
  );
}

export function runGenerate(panels: OutputPanelSet): void {
  const typeString = getTypeInput();
  const parseTimed = timedValue(() => tryParseEntries(typeString));
  if (!parseTimed.value.ok) {
    publishParseError(panels, parseTimed.value.err, typeString);
    return;
  }

  const entries = parseTimed.value.entries;
  syncDocblockOptions(hasPhpstanTypeAliases(entries));
  publishAst(panels, entries);

  try {
    const result = runTimedPipeline(entries, typeString);
    publishPipelineSuccess(panels, result, parseTimed.ms);
  } catch (err) {
    panels.irBuild.setError(err, typeString);
    panels.irOptimized.setError(err, typeString);
    panels.irMetrics.setError(err, typeString);
    panels.php.setError(err, typeString);
  }
}

const generatingIndicator =
  document.querySelector<HTMLElement>('#output-generating');
const outputBody = document.querySelector<HTMLElement>('.panel-body--output');

function setGeneratingIndicator(pending: boolean): void {
  if (generatingIndicator) {
    generatingIndicator.hidden = !pending;
  }
  outputBody?.classList.toggle('panel-body--pending', pending);
}

let generateTimeoutId: ReturnType<typeof setTimeout> | undefined;
let boundPanels: OutputPanelSet | undefined;

export function bindGeneratePanels(panels: OutputPanelSet): void {
  boundPanels = panels;
}

function requirePanels(): OutputPanelSet {
  if (boundPanels === undefined) {
    throw new Error('generate panels not bound');
  }
  return boundPanels;
}

export function onGenerateInputChanged(): void {
  syncFragmentToLocation();
  scheduleGenerate();
}

export function generateNow(): void {
  cancelScheduledGenerate();
  syncFragmentToLocation();
  runGenerate(requirePanels());
}

export function cancelScheduledGenerate(): void {
  if (generateTimeoutId !== undefined) {
    clearTimeout(generateTimeoutId);
    generateTimeoutId = undefined;
  }
  setGeneratingIndicator(false);
}

export function scheduleGenerate(): void {
  if (generateTimeoutId !== undefined) {
    clearTimeout(generateTimeoutId);
  }
  setGeneratingIndicator(true);
  generateTimeoutId = setTimeout(() => {
    generateTimeoutId = undefined;
    setGeneratingIndicator(false);
    runGenerate(requirePanels());
  }, INPUT_DEBOUNCE_MS);
}

export function initTypeInputFromFragment(): void {
  const typeInput = document.querySelector<HTMLTextAreaElement>('#type-input')!;
  const fromFragment = readFragmentFromLocation();
  if (fromFragment === null) {
    typeInput.value = TYPE_EXAMPLES[0].type;
  } else {
    applyFragmentState(fromFragment);
  }
  syncFragmentToLocation();
}
