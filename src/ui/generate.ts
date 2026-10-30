import {
  buildEntries,
  optimize as runOptimize,
  renderChecker,
} from '../generator/pipeline.ts';
import type { CheckerIR } from '../generator/ir/types.ts';
import type { TraceStep } from '../generator/optimizer/trace/types.ts';
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

export const INPUT_DEBOUNCE_MS = 250;

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
  readonly ran: boolean;
  readonly steps: readonly TraceStep[];
};

function runOptimizeStage(ir: CheckerIR): OptimizeStage {
  if (!wouldRunOptimizer()) {
    return { ir, ran: false, steps: [] };
  }
  const optimized = runOptimize(ir);
  return {
    ir: optimized.ir,
    ran: true,
    steps: optimized.steps,
  };
}

type GenerateResult = {
  readonly php: string;
  readonly optimizeRan: boolean;
  readonly optimizerSteps: readonly TraceStep[];
};

function runGeneratePipeline(
  entries: readonly ParsedCheckerEntry[],
  typeString: string,
): GenerateResult {
  const genOpts = getGenerateOptions();
  const built = buildEntries(entries, {
    ...genOpts,
    segmentSources: entries.map((e) => e.typeString),
  });
  const optimizeStage = runOptimizeStage(built.ir);
  const php = renderChecker(optimizeStage.ir, {
    ...genOpts,
    typeString,
    typesByName: built.typesByName,
    docStringsByName: built.docStringsByName,
    emitPhpstanTypeAliases:
      hasPhpstanTypeAliases(entries) && getEmitPhpstanTypeAliases(),
    phpstanTypeAliases: built.phpstanTypeAliases,
  });
  return {
    php,
    optimizeRan: optimizeStage.ran,
    optimizerSteps: optimizeStage.steps,
  };
}

function typeAstJson(entries: readonly ParsedCheckerEntry[]): string {
  if (entries.length === 1 && entries[0].aliasName === null) {
    return JSON.stringify(entries[0].ast, null, 2);
  }
  return JSON.stringify(
    entries.map(({ aliasName, typeString, ast }) => ({
      aliasName,
      typeString,
      ast,
    })),
    null,
    2,
  );
}

function publishParseError(
  panels: OutputPanelSet,
  err: unknown,
  typeString: string,
): void {
  syncDocblockOptions(false);
  panels.type.setError(err, typeString);
  panels.optimizeTrace.setError(err, typeString);
  panels.php.setError(err, typeString);
}

function publishGenerateSuccess(
  panels: OutputPanelSet,
  entries: readonly ParsedCheckerEntry[],
  result: GenerateResult,
): void {
  panels.type.setSuccess(typeAstJson(entries));
  panels.php.setSuccess(result.php);
  panels.optimizeTrace.setTrace(result.optimizerSteps, result.optimizeRan);
}

export function runGenerate(panels: OutputPanelSet): void {
  const typeString = getTypeInput();
  const parsed = tryParseEntries(typeString);
  if (!parsed.ok) {
    publishParseError(panels, parsed.err, typeString);
    return;
  }

  const entries = parsed.entries;
  syncDocblockOptions(hasPhpstanTypeAliases(entries));

  try {
    const result = runGeneratePipeline(entries, typeString);
    publishGenerateSuccess(panels, entries, result);
  } catch (err) {
    panels.type.setSuccess(typeAstJson(entries));
    panels.optimizeTrace.setError(err, typeString);
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
