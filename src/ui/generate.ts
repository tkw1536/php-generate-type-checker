import {
  buildMany,
  buildManyNamed,
  optimize,
  renderChecker,
} from '../generator/pipeline.ts';
import { isDocblockInput } from '../parser/phpstanTypeDocblock.ts';
import { parseTypes } from '../parser/parser.ts';
import {
  parsePhpstanTypesFromDocblock,
  type ResolvedPhpstanType,
} from '../parser/resolveTypeAliases.ts';
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

export { DEFAULT_TYPE } from './generateControls.ts';
export const INPUT_DEBOUNCE_MS = 250;

function runBuildPipeline(
  panels: OutputPanelSet,
  typeString: string,
  genOpts: ReturnType<typeof getGenerateOptions>,
  built: {
    readonly ir: ReturnType<typeof buildMany>['ir'];
    readonly typesByName: ReturnType<typeof buildMany>['typesByName'];
    readonly docStringsByName?: ReturnType<typeof buildMany>['docStringsByName'];
    readonly phpstanTypeAliases?: ReturnType<
      typeof buildManyNamed
    >['phpstanTypeAliases'];
  },
  renderExtras?: {
    readonly emitPhpstanTypeAliases?: boolean;
    readonly phpstanTypeAliases?: ReturnType<
      typeof buildManyNamed
    >['phpstanTypeAliases'];
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
        phpstanTypeAliases:
          renderExtras?.phpstanTypeAliases ?? built.phpstanTypeAliases,
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
  syncDocblockOptions();

  if (isDocblockInput(typeString)) {
    runGenerateDocblock(panels, typeString, genOpts);
    return;
  }

  runGeneratePlainTypes(panels, typeString, genOpts);
}

function runGenerateDocblock(
  panels: OutputPanelSet,
  typeString: string,
  genOpts: ReturnType<typeof getGenerateOptions>,
): void {
  const defs = parseDocblockDefs(panels, typeString);
  if (defs === undefined) {
    panels.irBuild.setError(new Error('Parse failed'), typeString);
    panels.irOptimized.setError(new Error('Parse failed'), typeString);
    panels.php.setError(new Error('Parse failed'), typeString);
    return;
  }
  buildDocblockOutput(panels, typeString, genOpts, defs);
}

function parseDocblockDefs(
  panels: OutputPanelSet,
  typeString: string,
): readonly ResolvedPhpstanType[] | undefined {
  try {
    const defs = parsePhpstanTypesFromDocblock(typeString, {
      resolveAliases: getResolveAliases(),
    });
    panels.ast.setSuccess(
      JSON.stringify(
        defs.map((d) => ({
          name: d.name,
          typeString: d.typeString,
          ast: d.ast,
        })),
        null,
        2,
      ),
    );
    return defs;
  } catch (err) {
    panels.ast.setError(err, typeString);
    return undefined;
  }
}

function buildDocblockOutput(
  panels: OutputPanelSet,
  typeString: string,
  genOpts: ReturnType<typeof getGenerateOptions>,
  defs: readonly ResolvedPhpstanType[],
): void {
  try {
    const built = buildManyNamed(
      defs.map((d) => ({
        name: d.name,
        type: d.ast,
        typeString: d.typeString,
      })),
      {
        ...genOpts,
        segmentSources: defs.map((d) => d.typeString),
      },
    );
    runBuildPipeline(panels, typeString, genOpts, built, {
      emitPhpstanTypeAliases: getEmitPhpstanTypeAliases(),
      phpstanTypeAliases: built.phpstanTypeAliases,
    });
  } catch (err) {
    panels.irBuild.setError(err, typeString);
    panels.irOptimized.setError(err, typeString);
    panels.php.setError(err, typeString);
  }
}

function runGeneratePlainTypes(
  panels: OutputPanelSet,
  typeString: string,
  genOpts: ReturnType<typeof getGenerateOptions>,
): void {
  let parsed: ReturnType<typeof parseTypes> | undefined;
  try {
    parsed = parseTypes(typeString);
    panels.ast.setSuccess(
      JSON.stringify(
        parsed.segments.map((s) => ({
          start: s.start,
          end: s.end,
          ast: s.ast,
        })),
        null,
        2,
      ),
    );
  } catch (err) {
    panels.ast.setError(err, typeString);
  }

  if (parsed === undefined) {
    panels.irBuild.setError(new Error('Parse failed'), typeString);
    panels.irOptimized.setError(new Error('Parse failed'), typeString);
    panels.php.setError(new Error('Parse failed'), typeString);
    return;
  }

  try {
    const segmentSources = parsed.segments.map((s) =>
      parsed.source.slice(s.start, s.end),
    );
    const built = buildMany(
      parsed.segments.map((s) => s.ast),
      { ...genOpts, segmentSources },
    );
    runBuildPipeline(panels, typeString, genOpts, built);
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
