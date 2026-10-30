import { formatTypeAstJson } from '../generator/typeAstJson.ts';
import { runGeneratePipeline } from '../generator/runPipeline.ts';
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
  readonly entries: ReturnType<typeof parseCheckerInput>;
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

/**
 * Map UI controls onto {@link runGeneratePipeline} and push results into panels.
 */
function publishGenerateSuccess(
  panels: OutputPanelSet,
  typeString: string,
): void {
  const genOpts = getGenerateOptions();
  const result = runGeneratePipeline(typeString, {
    ...genOpts,
    // UI Optimize checked ⇒ run optimizer (not prioritize readability).
    prioritizeReadabilityOverCompactness: !wouldRunOptimizer(),
    resolveAliases: getResolveAliases(),
    emitPhpstanTypeAliases: getEmitPhpstanTypeAliases(),
  });
  panels.type.setSuccess(formatTypeAstJson(result.entries));
  panels.php.setSuccess(result.php);
  panels.optimizeTrace.setTrace(result.steps, result.optimizeRan);
}

export function runGenerate(panels: OutputPanelSet): void {
  const typeString = getTypeInput();
  const parsed = tryParseEntries(typeString);
  if (!parsed.ok) {
    publishParseError(panels, parsed.err, typeString);
    return;
  }

  syncDocblockOptions(hasPhpstanTypeAliases(parsed.entries));

  try {
    publishGenerateSuccess(panels, typeString);
  } catch (err) {
    // Type tab can still show a successful parse when codegen fails.
    panels.type.setSuccess(formatTypeAstJson(parsed.entries));
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

// Browser timer id (DOM `number`); avoid NodeJS.Timeout when @types/node is loaded.
let generateTimeoutId: number | undefined;
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
    window.clearTimeout(generateTimeoutId);
    generateTimeoutId = undefined;
  }
  setGeneratingIndicator(false);
}

export function scheduleGenerate(): void {
  if (generateTimeoutId !== undefined) {
    window.clearTimeout(generateTimeoutId);
  }
  setGeneratingIndicator(true);
  generateTimeoutId = window.setTimeout(() => {
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
