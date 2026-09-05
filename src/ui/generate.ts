import {
  buildEntries,
  optimize,
  renderChecker,
} from '../generator/pipeline.ts';
import {
  hasPhpstanTypeAliases,
  parseCheckerInput,
  type ParsedCheckerEntry,
} from '../parser/parseInput.ts';
import { readFragmentFromLocation } from './fragmentState.ts';
import {
  DEFAULT_TYPE,
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

function runBuildPipeline(
  panels: OutputPanelSet,
  typeString: string,
  genOpts: ReturnType<typeof getGenerateOptions>,
  built: ReturnType<typeof buildEntries>,
  renderExtras?: {
    readonly emitPhpstanTypeAliases?: boolean;
  },
): void {
  try {
    const builtJson = JSON.stringify(built.ir, null, 2);
    panels.irBuild.setSuccess(builtJson);
    const irForPhp = wouldRunOptimizer() ? optimize(built.ir) : built.ir;
    if (wouldRunOptimizer()) {
      panels.irOptimized.setSuccess(JSON.stringify(irForPhp, null, 2));
    } else {
      panels.irOptimized.setSuccess(
        'Optimizer skipped (Optimize is off).\nIR (optimized) matches IR (build).',
      );
    }
    panels.php.setSuccess(
      renderChecker(irForPhp, {
        ...genOpts,
        typeString,
        typesByName: built.typesByName,
        docStringsByName: built.docStringsByName,
        emitPhpstanTypeAliases: renderExtras?.emitPhpstanTypeAliases,
        phpstanTypeAliases: built.phpstanTypeAliases,
      }),
    );
  } catch (err) {
    panels.irBuild.setError(err, typeString);
    panels.irOptimized.setError(err, typeString);
    panels.php.setError(err, typeString);
  }
}

export function runGenerate(panels: OutputPanelSet): void {
  const typeString = getTypeInput();
  const genOpts = getGenerateOptions();

  let entries: readonly ParsedCheckerEntry[] | undefined;
  try {
    entries = parseCheckerInput(typeString, {
      resolveAliases: getResolveAliases(),
    });
    syncDocblockOptions(hasPhpstanTypeAliases(entries));
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
  } catch (err) {
    syncDocblockOptions(false);
    panels.ast.setError(err, typeString);
    panels.irBuild.setError(err, typeString);
    panels.irOptimized.setError(err, typeString);
    panels.php.setError(err, typeString);
    return;
  }

  try {
    const built = buildEntries(entries, {
      ...genOpts,
      segmentSources: entries.map((e) => e.typeString),
    });
    runBuildPipeline(panels, typeString, genOpts, built, {
      emitPhpstanTypeAliases:
        hasPhpstanTypeAliases(entries) && getEmitPhpstanTypeAliases(),
    });
  } catch (err) {
    panels.irBuild.setError(err, typeString);
    panels.irOptimized.setError(err, typeString);
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
    typeInput.value = DEFAULT_TYPE;
  } else {
    applyFragmentState(fromFragment);
  }
  syncFragmentToLocation();
}
