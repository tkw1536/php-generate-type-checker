import {
  detectOutputLanguage,
  highlightCode,
  type HighlightLanguage,
} from '../highlight.ts';
import { describeError } from '../describeError.ts';
import { renderErrorHtml } from './errorDisplay.ts';
import { OptimizeTracePanel } from './optimizeTracePanel.ts';
import { TypeAstPanel } from './typeAstPanel.ts';

/** Left → right: Type → Trace → PHP */
export type OutputTabId = 'type' | 'optimize-trace' | 'php';

const OUTPUT_TAB_IDS: ReadonlySet<string> = new Set([
  'type',
  'optimize-trace',
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

export type OptimizeTracePanelRef = Readonly<OptimizeTracePanel>;

export type TypeAstPanelRef = Readonly<TypeAstPanel>;

export type CopyablePanel = {
  readonly tabId: OutputTabId;
  readonly rawText: string;
};

export type OutputPanelSet = {
  readonly type: TypeAstPanelRef;
  readonly optimizeTrace: OptimizeTracePanelRef;
  readonly php: OutputPanelRef;
};

const outputPanels: OutputPanel[] = [];
let typeAstPanel: TypeAstPanel | undefined;
let optimizeTracePanel: OptimizeTracePanel | undefined;
let activeOutputTab: OutputTabId = 'php';

const copyBtn = document.querySelector<HTMLButtonElement>('#output-copy')!;
const copyStatus = document.querySelector<HTMLElement>('#copy-status');
// Browser timer id (DOM `number`); avoid NodeJS.Timeout when @types/node is loaded.
let copyStatusTimeoutId: number | undefined;

const OUTPUT_PRE_LABELS: Record<string, string> = {
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
  let code = pre.querySelector('code');
  if (code === null) {
    code = document.createElement('code');
    pre.replaceChildren(code);
  }
  return { pre, code };
}

export function getActiveOutputTab(): OutputTabId {
  return activeOutputTab;
}

export function setActiveOutputTab(tabId: OutputTabId): void {
  activeOutputTab = tabId;
}

export function getActiveOutputPanel(): CopyablePanel {
  if (activeOutputTab === 'type' && typeAstPanel !== undefined) {
    return typeAstPanel;
  }
  if (
    activeOutputTab === 'optimize-trace' &&
    optimizeTracePanel !== undefined
  ) {
    return optimizeTracePanel;
  }
  return (
    outputPanels.find((p: OutputPanelRef) => p.tabId === activeOutputTab) ??
    outputPanels[0]
  );
}

export function syncCopyButton(): void {
  const onPhp = activeOutputTab === 'php';
  copyBtn.hidden = !onPhp;
  if (!onPhp) {
    copyBtn.disabled = true;
    return;
  }
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
  const typeBody = document.querySelector<HTMLElement>('#type-output-body')!;
  typeAstPanel = new TypeAstPanel(typeBody);
  const traceBody = document.querySelector<HTMLElement>(
    '#optimize-trace-output-body',
  )!;
  optimizeTracePanel = new OptimizeTracePanel(traceBody);
  setupTypeTreeActions();
  return {
    type: typeAstPanel,
    optimizeTrace: optimizeTracePanel,
    php: setupOutputPanel('php', 'php-output-body', 'php-output', 'php'),
  };
}

function setupTypeTreeActions(): void {
  const expandBtn = document.querySelector<HTMLButtonElement>(
    '#type-expand-all',
  );
  const collapseBtn = document.querySelector<HTMLButtonElement>(
    '#type-collapse-all',
  );
  expandBtn?.addEventListener('click', () => {
    typeAstPanel?.setJsonTreeExpanded(true);
  });
  collapseBtn?.addEventListener('click', () => {
    typeAstPanel?.setJsonTreeExpanded(false);
  });
}

export function refreshAllHighlights(): void {
  typeAstPanel?.refresh();
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
      if (activeOutputTab !== 'php') {
        return;
      }
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
        window.clearTimeout(copyStatusTimeoutId);
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
