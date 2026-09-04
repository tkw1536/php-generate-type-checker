import {
  detectOutputLanguage,
  highlightCode,
  type HighlightLanguage,
} from '../highlight.ts';
import { describeError, renderErrorHtml } from './errorDisplay.ts';

/** Left → right in the tab bar: AST → IR build → IR optimized → PHP */
export type OutputTabId = 'ast' | 'ir-build' | 'ir-optimized' | 'php';

const OUTPUT_TAB_IDS: ReadonlySet<string> = new Set([
  'ast',
  'ir-build',
  'ir-optimized',
  'php',
]);

export function isOutputTabId(value: string): value is OutputTabId {
  return OUTPUT_TAB_IDS.has(value);
}

export class OutputPanel {
  readonly tabId: OutputTabId;
  readonly bodyEl: HTMLElement;
  readonly preId: string;
  readonly defaultLanguage: HighlightLanguage;
  rawText = '';

  constructor(
    tabId: OutputTabId,
    bodyEl: HTMLElement,
    preId: string,
    defaultLanguage: HighlightLanguage,
  ) {
    this.tabId = tabId;
    this.bodyEl = bodyEl;
    this.preId = preId;
    this.defaultLanguage = defaultLanguage;
  }

  setSuccess(text: string): void {
    this.rawText = text;
    this.bodyEl.classList.remove('panel-body--error');

    const { code } = getPreAndCode(this.bodyEl, this.preId);

    const language = detectOutputLanguage(text, this.defaultLanguage);
    code.className = `hljs language-${language}`;
    code.innerHTML = highlightCode(text, language);
    syncCopyButton();
  }

  setError(err: unknown, sourceText: string): void {
    const described = describeError(err);
    this.rawText = described.message;
    this.bodyEl.classList.add('panel-body--error');
    this.bodyEl.innerHTML = renderErrorHtml(described, sourceText);
    syncCopyButton();
  }
}

/** Parameter view of {@link OutputPanel} for prefer-readonly-parameter-types. */
export type OutputPanelRef = Readonly<OutputPanel>;

export type OutputPanelSet = {
  readonly ast: OutputPanelRef;
  readonly irBuild: OutputPanelRef;
  readonly irOptimized: OutputPanelRef;
  readonly php: OutputPanelRef;
};

const outputPanels: OutputPanel[] = [];
let activeOutputTab: OutputTabId = 'php';

const copyBtn = document.querySelector<HTMLButtonElement>('#output-copy')!;
const copyStatus = document.querySelector<HTMLElement>('#copy-status');
let copyStatusTimeoutId: ReturnType<typeof setTimeout> | undefined;

const OUTPUT_PRE_LABELS: Record<string, string> = {
  'ast-output': 'Type AST output',
  'ir-build-output': 'IR (build) output',
  'ir-optimized-output': 'IR (optimized) output',
  'php-output': 'PHP Code output',
};

function getPreAndCode(
  bodyEl: HTMLElement,
  preId: string,
): {
  pre: HTMLPreElement;
  code: HTMLElement;
} {
  let pre = bodyEl.querySelector<HTMLPreElement>(`#${preId}`);
  if (!pre) {
    const label = OUTPUT_PRE_LABELS[preId];
    const labelAttr = label ? ` aria-label="${label}"` : '';
    bodyEl.innerHTML = `<pre class="output-pre" id="${preId}"${labelAttr}><code></code></pre>`;
    pre = bodyEl.querySelector<HTMLPreElement>(`#${preId}`)!;
  }
  const code = pre.querySelector('code')!;
  return { pre, code };
}

export function getActiveOutputTab(): OutputTabId {
  return activeOutputTab;
}

export function setActiveOutputTab(tabId: OutputTabId): void {
  activeOutputTab = tabId;
}

export function getActiveOutputPanel(): OutputPanelRef {
  return (
    outputPanels.find((p: OutputPanelRef) => p.tabId === activeOutputTab) ??
    outputPanels[0]
  );
}

export function syncCopyButton(): void {
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
  const panel = new OutputPanel(tabId, bodyEl, preId, defaultLanguage);
  outputPanels.push(panel);
  return panel;
}

export function setupOutputPanels(): OutputPanelSet {
  return {
    ast: setupOutputPanel('ast', 'ast-output-body', 'ast-output', 'json'),
    irBuild: setupOutputPanel(
      'ir-build',
      'ir-build-output-body',
      'ir-build-output',
      'json',
    ),
    irOptimized: setupOutputPanel(
      'ir-optimized',
      'ir-optimized-output-body',
      'ir-optimized-output',
      'json',
    ),
    php: setupOutputPanel('php', 'php-output-body', 'php-output', 'php'),
  };
}

export function refreshAllHighlights(): void {
  for (const panel of outputPanels) {
    if (
      panel.rawText !== '' &&
      !panel.bodyEl.classList.contains('panel-body--error')
    ) {
      panel.setSuccess(panel.rawText);
    }
  }
}

export function setupCopyButton(): void {
  copyBtn.addEventListener('click', () => {
    void (async () => {
      const panel = getActiveOutputPanel();
      if (panel.rawText === '') {
        return;
      }
      await navigator.clipboard.writeText(panel.rawText);
      copyBtn.textContent = 'Copied!';
      copyBtn.classList.add('copied');
      if (copyStatus !== null) {
        copyStatus.textContent = 'Copied to clipboard';
      }
      if (copyStatusTimeoutId !== undefined) {
        clearTimeout(copyStatusTimeoutId);
      }
      copyStatusTimeoutId = window.setTimeout(() => {
        copyStatusTimeoutId = undefined;
        copyBtn.textContent = 'Copy';
        copyBtn.classList.remove('copied');
        if (copyStatus !== null) {
          copyStatus.textContent = '';
        }
      }, 1500);
    })();
  });
}
