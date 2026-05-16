import './style.css';
import {
  checkerIRSnapshotsForType,
  generateChecker,
  parseType,
  type CheckerOutputMode,
} from './index.ts';
import {
  detectOutputLanguage,
  highlightCode,
  type HighlightLanguage,
} from './highlight.ts';
import { initTheme, toggleTheme } from './theme.ts';
import { describeError, renderErrorHtml } from './ui/errorDisplay.ts';
import { TYPE_EXAMPLES } from './ui/examples.ts';

initTheme();

const DEFAULT_TYPE =
  'array{id: int, email: non-empty-string, name?: string}';
const INPUT_DEBOUNCE_MS = 300;
const TYPE_INPUT_STORAGE_KEY = 'php-generate-type-checker:type-input';
const PERSIST_TYPE_INPUT_IN_DEV = import.meta.env.DEV;

function readStoredTypeInput(): string | null {
  if (!PERSIST_TYPE_INPUT_IN_DEV) {
    return null;
  }
  try {
    return sessionStorage.getItem(TYPE_INPUT_STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStoredTypeInput(value: string): void {
  if (!PERSIST_TYPE_INPUT_IN_DEV) {
    return;
  }
  try {
    sessionStorage.setItem(TYPE_INPUT_STORAGE_KEY, value);
  } catch {
    /* ignore (private mode, quota, etc.) */
  }
}

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

function getPrioritizeReadabilityOverCompactness(): boolean {
  const el = document.querySelector<HTMLInputElement>(
    '#generate-prioritize-readability',
  );
  return el?.checked === true;
}

function getGenerateOptions() {
  return {
    output: getGenerateOutputMode(),
    nameFunctionsByType: getNameFunctionsByType(),
    prioritizeReadabilityOverCompactness: getPrioritizeReadabilityOverCompactness(),
  };
}

function runGenerate(panels: {
  ast: OutputPanel;
  irBuild: OutputPanel;
  irOptimized: OutputPanel;
  php: OutputPanel;
}): void {
  const typeString = getTypeInput();
  const genOpts = getGenerateOptions();

  try {
    setSuccessOutput(panels.ast, JSON.stringify(parseType(typeString), null, 2));
  } catch (err) {
    setErrorOutput(panels.ast, err, typeString);
  }

  try {
    const ir = checkerIRSnapshotsForType(typeString, genOpts);
    setSuccessOutput(panels.irBuild, ir.built);
    setSuccessOutput(panels.irOptimized, ir.optimized);
  } catch (err) {
    setErrorOutput(panels.irBuild, err, typeString);
    setErrorOutput(panels.irOptimized, err, typeString);
  }

  try {
    setSuccessOutput(panels.php, generateChecker(typeString, genOpts));
  } catch (err) {
    setErrorOutput(panels.php, err, typeString);
  }

}

function onGenerateInputChanged(): void {
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
const outputModeSelect = document.querySelector<HTMLSelectElement>('#generate-output-mode')!;
const nameByTypeCheckbox =
  document.querySelector<HTMLInputElement>('#generate-name-by-type')!;
const prioritizeReadabilityCheckbox = document.querySelector<HTMLInputElement>(
  '#generate-prioritize-readability',
)!;

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

typeInput.addEventListener('input', () => {
  writeStoredTypeInput(typeInput.value);
  onGenerateInputChanged();
});
outputModeSelect.addEventListener('change', onGenerateInputChanged);
nameByTypeCheckbox.addEventListener('change', onGenerateInputChanged);
prioritizeReadabilityCheckbox.addEventListener('change', onGenerateInputChanged);

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
    writeStoredTypeInput(type);
    onGenerateInputChanged();
  });
}

setupOutputTabs();
setupExamples();

{
  const stored = readStoredTypeInput();
  typeInput.value = stored !== null ? stored : DEFAULT_TYPE;
}
runGenerate(outputPanelSet);
