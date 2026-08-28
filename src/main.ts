import './style.css';
import {
  detectOutputLanguage,
  highlightCode,
  type HighlightLanguage,
} from './highlight.ts';
import { initTheme, toggleTheme } from './theme.ts';
import { describeError, renderErrorHtml } from './ui/errorDisplay.ts';
import { TYPE_EXAMPLES } from './ui/examples.ts';
import {
  readFragmentFromLocation,
  replaceLocationFragment,
  type AppFragmentState,
} from './ui/fragmentState.ts';
import type { CheckerOutputMode } from "./generator/options.ts";
import {
  buildMany,
  buildManyNamed,
  optimize,
  renderChecker,
} from "./generator/pipeline.ts";
import { isDocblockInput } from "./parser/phpstanTypeDocblock.ts";
import { parseTypes } from "./parser/parser.ts";
import { parsePhpstanTypesFromDocblock } from "./parser/resolveTypeAliases.ts";

initTheme();

const DEFAULT_TYPE =
  'array{id: int, email: non-empty-string, name?: string}';
const INPUT_DEBOUNCE_MS = 300;

/** Left → right in the tab bar: AST → IR build → IR optimized → PHP */
type OutputTabId = 'ast' | 'ir-build' | 'ir-optimized' | 'php';

interface OutputPanel {
  tabId: OutputTabId;
  bodyEl: HTMLElement;
  preId: string;
  defaultLanguage: HighlightLanguage;
  rawText: string;
}

const outputPanels: OutputPanel[] = [];
let activeOutputTab: OutputTabId = 'php';

const copyBtn = document.querySelector<HTMLButtonElement>('#output-copy')!;

function getPreAndCode(bodyEl: HTMLElement, preId: string): {
  pre: HTMLPreElement;
  code: HTMLElement;
} {
  let pre = bodyEl.querySelector<HTMLPreElement>(`#${preId}`);
  if (!pre) {
    bodyEl.innerHTML = `<pre class="output-pre" id="${preId}"><code></code></pre>`;
    pre = bodyEl.querySelector<HTMLPreElement>(`#${preId}`)!;
  }
  const code = pre.querySelector('code')!;
  return { pre, code };
}

function getActiveOutputPanel(): OutputPanel {
  return outputPanels.find((p) => p.tabId === activeOutputTab) ?? outputPanels[0]!;
}

function syncCopyButton(): void {
  const panel = getActiveOutputPanel();
  copyBtn.disabled = panel.rawText.length === 0;
}

function setupOutputPanel(
  tabId: OutputTabId,
  bodyId: string,
  preId: string,
  defaultLanguage: HighlightLanguage,
): OutputPanel {
  const bodyEl = document.querySelector<HTMLElement>(`#${bodyId}`)!;

  const panel: OutputPanel = {
    tabId,
    bodyEl,
    preId,
    defaultLanguage,
    rawText: '',
  };

  outputPanels.push(panel);
  return panel;
}

function setSuccessOutput(panel: OutputPanel, text: string): void {
  panel.rawText = text;
  panel.bodyEl.classList.remove('panel-body--error');

  const { code } = getPreAndCode(panel.bodyEl, panel.preId);

  const language = detectOutputLanguage(text, panel.defaultLanguage);
  code.className = `hljs language-${language}`;
  code.innerHTML = highlightCode(text, language);
  syncCopyButton();
}

function setErrorOutput(panel: OutputPanel, err: unknown, sourceText: string): void {
  const described = describeError(err);
  panel.rawText = described.message;
  panel.bodyEl.classList.add('panel-body--error');
  panel.bodyEl.innerHTML = renderErrorHtml(described, sourceText);
  syncCopyButton();
}

function refreshAllHighlights(): void {
  for (const panel of outputPanels) {
    if (panel.rawText && !panel.bodyEl.classList.contains('panel-body--error')) {
      setSuccessOutput(panel, panel.rawText);
    }
  }
}

function getGenerateOutputMode(): CheckerOutputMode {
  const el = document.querySelector<HTMLSelectElement>('#generate-output-mode');
  const v = el?.value;
  switch (v) {
    case 'function':
    case 'public_static':
    case 'protected_static':
    case 'private_static':
      return v;
    default:
      return 'function';
  }
}

function getTypeInput(): string {
  const input = document.querySelector<HTMLTextAreaElement>('#type-input')!;
  return input.value.trim() || DEFAULT_TYPE;
}

function getNameFunctionsByType(): boolean {
  const el = document.querySelector<HTMLInputElement>('#generate-name-by-type');
  return el?.checked !== false;
}

function getOptimize(): boolean {
  const el = document.querySelector<HTMLInputElement>(
    '#generate-prioritize-readability',
  );
  return el?.checked === true;
}

function getEmitPhpstanTypeAliases(): boolean {
  const el = document.querySelector<HTMLInputElement>('#generate-emit-aliases');
  return el?.checked === true;
}

function getPrioritizeReadabilityOverCompactness(): boolean {
  return !getOptimize();
}

function wouldRunOptimizer(): boolean {
  return getOptimize();
}

function readUiFragmentState(): AppFragmentState {
  return {
    nameFromType: getNameFunctionsByType(),
    optimize: getOptimize(),
    emit: getGenerateOutputMode(),
    emitAliases: getEmitPhpstanTypeAliases(),
    input: document.querySelector<HTMLTextAreaElement>('#type-input')!.value,
  };
}

function applyFragmentState(fragment: Partial<AppFragmentState>): void {
  if (fragment.nameFromType !== undefined) {
    document.querySelector<HTMLInputElement>('#generate-name-by-type')!.checked =
      fragment.nameFromType;
  }
  if (fragment.optimize !== undefined) {
    document.querySelector<HTMLInputElement>(
      '#generate-prioritize-readability',
    )!.checked = fragment.optimize;
  }
  if (fragment.emit !== undefined) {
    document.querySelector<HTMLSelectElement>('#generate-output-mode')!.value =
      fragment.emit;
  }
  if (fragment.emitAliases !== undefined) {
    document.querySelector<HTMLInputElement>('#generate-emit-aliases')!.checked =
      fragment.emitAliases;
  }
  if (fragment.input !== undefined) {
    document.querySelector<HTMLTextAreaElement>('#type-input')!.value =
      fragment.input;
  }
}

function syncFragmentToLocation(): void {
  replaceLocationFragment(readUiFragmentState());
}

function getGenerateOptions() {
  return {
    output: getGenerateOutputMode(),
    nameFunctionsByType: getNameFunctionsByType(),
    prioritizeReadabilityOverCompactness: getPrioritizeReadabilityOverCompactness(),
  };
}

function syncInputLabel(): void {
  const label = document.querySelector<HTMLLabelElement>('#type-input-label');
  const emitAliasesLabel = document.querySelector<HTMLLabelElement>(
    '#generate-emit-aliases-label',
  );
  const raw = document.querySelector<HTMLTextAreaElement>('#type-input')!.value;
  const docblock = isDocblockInput(raw);
  if (label) {
    label.textContent = docblock ? 'Docblock (@phpstan-type)' : 'Types or docblock';
  }
  if (emitAliasesLabel) {
    emitAliasesLabel.hidden = !docblock;
  }
}

function runBuildPipeline(
  panels: {
    ast: OutputPanel;
    irBuild: OutputPanel;
    irOptimized: OutputPanel;
    php: OutputPanel;
  },
  typeString: string,
  genOpts: ReturnType<typeof getGenerateOptions>,
  built: {
    ir: ReturnType<typeof buildMany>['ir'];
    typesByName: ReturnType<typeof buildMany>['typesByName'];
    docStringsByName?: ReturnType<typeof buildMany>['docStringsByName'];
    phpstanTypeAliases?: ReturnType<typeof buildManyNamed>['phpstanTypeAliases'];
  },
  renderExtras?: {
    emitPhpstanTypeAliases?: boolean;
    phpstanTypeAliases?: ReturnType<typeof buildManyNamed>['phpstanTypeAliases'];
  },
): void {
  try {
    const builtJson = JSON.stringify(built.ir, null, 2);
    setSuccessOutput(panels.irBuild, builtJson);
    const irForPhp = wouldRunOptimizer() ? optimize(built.ir) : built.ir;
    if (wouldRunOptimizer()) {
      setSuccessOutput(panels.irOptimized, JSON.stringify(irForPhp, null, 2));
    } else {
      setSuccessOutput(
        panels.irOptimized,
        'Optimizer skipped (Optimize is off).\nIR (optimized) matches IR (build).',
      );
    }
    setSuccessOutput(
      panels.php,
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
    setErrorOutput(panels.irBuild, err, typeString);
    setErrorOutput(panels.irOptimized, err, typeString);
    setErrorOutput(panels.php, err, typeString);
  }
}

function runGenerate(panels: {
  ast: OutputPanel;
  irBuild: OutputPanel;
  irOptimized: OutputPanel;
  php: OutputPanel;
}): void {
  const typeString = getTypeInput();
  const genOpts = getGenerateOptions();
  syncInputLabel();

  if (isDocblockInput(typeString)) {
    let defs: ReturnType<typeof parsePhpstanTypesFromDocblock> | undefined;
    try {
      defs = parsePhpstanTypesFromDocblock(typeString);
      setSuccessOutput(
        panels.ast,
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
    } catch (err) {
      setErrorOutput(panels.ast, err, typeString);
    }

    if (defs === undefined) {
      setErrorOutput(panels.irBuild, new Error('Parse failed'), typeString);
      setErrorOutput(panels.irOptimized, new Error('Parse failed'), typeString);
      setErrorOutput(panels.php, new Error('Parse failed'), typeString);
      return;
    }

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
      setErrorOutput(panels.irBuild, err, typeString);
      setErrorOutput(panels.irOptimized, err, typeString);
      setErrorOutput(panels.php, err, typeString);
    }
    return;
  }

  let parsed: ReturnType<typeof parseTypes> | undefined;
  try {
    parsed = parseTypes(typeString);
    setSuccessOutput(
      panels.ast,
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
    setErrorOutput(panels.ast, err, typeString);
  }

  if (parsed === undefined) {
    setErrorOutput(panels.irBuild, new Error('Parse failed'), typeString);
    setErrorOutput(panels.irOptimized, new Error('Parse failed'), typeString);
    setErrorOutput(panels.php, new Error('Parse failed'), typeString);
    return;
  }

  try {
    const segmentSources = parsed.segments.map((s) =>
      parsed!.source.slice(s.start, s.end),
    );
    const built = buildMany(
      parsed.segments.map((s) => s.ast),
      { ...genOpts, segmentSources },
    );
    runBuildPipeline(panels, typeString, genOpts, built);
  } catch (err) {
    setErrorOutput(panels.irBuild, err, typeString);
    setErrorOutput(panels.irOptimized, err, typeString);
    setErrorOutput(panels.php, err, typeString);
  }
}

function onGenerateInputChanged(): void {
  syncFragmentToLocation();
  scheduleGenerate();
}

function debounce(fn: () => void, ms: number): () => void {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  return () => {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }
    timeoutId = setTimeout(() => {
      timeoutId = undefined;
      fn();
    }, ms);
  };
}

function setupOutputTabs(): void {
  const tabButtons = document.querySelectorAll<HTMLButtonElement>('.output-tab[data-output-tab]');
  const tabPanels = document.querySelectorAll<HTMLElement>('.output-tab-panel[data-output-panel]');

  tabButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const tabId = button.dataset.outputTab as OutputTabId | undefined;
      if (!tabId) {
        return;
      }

      activeOutputTab = tabId;

      tabButtons.forEach((btn) => {
        const active = btn === button;
        btn.classList.toggle('active', active);
        btn.setAttribute('aria-selected', active ? 'true' : 'false');
      });

      tabPanels.forEach((panel) => {
        const active = panel.dataset.outputPanel === tabId;
        panel.classList.toggle('active', active);
        panel.hidden = !active;
      });

      syncCopyButton();
    });
  });
}

const astPanel = setupOutputPanel('ast', 'ast-output-body', 'ast-output', 'json');
const irBuildPanel = setupOutputPanel(
  'ir-build',
  'ir-build-output-body',
  'ir-build-output',
  'json',
);
const irOptimizedPanel = setupOutputPanel(
  'ir-optimized',
  'ir-optimized-output-body',
  'ir-optimized-output',
  'json',
);
const phpPanel = setupOutputPanel('php', 'php-output-body', 'php-output', 'php');

const outputPanelSet = {
  ast: astPanel,
  irBuild: irBuildPanel,
  irOptimized: irOptimizedPanel,
  php: phpPanel,
};

const scheduleGenerate = debounce(() => runGenerate(outputPanelSet), INPUT_DEBOUNCE_MS);

const typeInput = document.querySelector<HTMLTextAreaElement>('#type-input')!;
const outputModeSelect =
  document.querySelector<HTMLSelectElement>('#generate-output-mode')!;
const nameByTypeCheckbox =
  document.querySelector<HTMLInputElement>('#generate-name-by-type')!;
const prioritizeReadabilityCheckbox = document.querySelector<HTMLInputElement>(
  '#generate-prioritize-readability',
)!;
const emitAliasesCheckbox =
  document.querySelector<HTMLInputElement>('#generate-emit-aliases')!;

copyBtn.addEventListener('click', async () => {
  const panel = getActiveOutputPanel();
  if (!panel.rawText) {
    return;
  }
  await navigator.clipboard.writeText(panel.rawText);
  copyBtn.textContent = 'Copied!';
  copyBtn.classList.add('copied');
  window.setTimeout(() => {
    copyBtn.textContent = 'Copy';
    copyBtn.classList.remove('copied');
  }, 1500);
});

typeInput.addEventListener('input', onGenerateInputChanged);
outputModeSelect.addEventListener('change', onGenerateInputChanged);
nameByTypeCheckbox.addEventListener('change', onGenerateInputChanged);
prioritizeReadabilityCheckbox.addEventListener('change', onGenerateInputChanged);
emitAliasesCheckbox.addEventListener('change', onGenerateInputChanged);

document.querySelector<HTMLButtonElement>('#theme-toggle')!.addEventListener('click', () => {
  toggleTheme();
});

document.addEventListener('themechange', () => {
  refreshAllHighlights();
});

function setupExamples(): void {
  const select = document.querySelector<HTMLSelectElement>('#type-example')!;
  const input = document.querySelector<HTMLTextAreaElement>('#type-input')!;

  for (const example of TYPE_EXAMPLES) {
    const option = document.createElement('option');
    option.value = example.type;
    option.textContent = example.label;
    select.appendChild(option);
  }

  select.addEventListener('change', () => {
    const type = select.value;
    if (!type) {
      return;
    }
    input.value = type;
    select.value = '';
    onGenerateInputChanged();
  });
}

setupOutputTabs();
setupExamples();

{
  const fromFragment = readFragmentFromLocation();
  if (fromFragment !== null) {
    applyFragmentState(fromFragment);
  } else {
    typeInput.value = DEFAULT_TYPE;
  }
  syncFragmentToLocation();
}
runGenerate(outputPanelSet);
