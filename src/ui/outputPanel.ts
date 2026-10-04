import {
  detectOutputLanguage,
  highlightCode,
  type HighlightLanguage,
} from '../highlight.ts';
import { describeError, renderErrorHtml } from './errorDisplay.ts';
import { IrMetricsPanel } from './irMetricsPanel.ts';
import {
  applyExpansionState,
  collectExpansionState,
  setJsonTreeExpanded,
} from './jsonTreeExpand.ts';
import { parseJsonValue, renderJsonTree } from './jsonTreeView.ts';

/** Left → right: Pipeline → Metrics → PHP */
export type OutputTabId = 'pipeline' | 'ir-metrics' | 'php';

const OUTPUT_TAB_IDS: ReadonlySet<string> = new Set([
  'pipeline',
  'ir-metrics',
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

    const { pre, code } = getPreAndCode(this.bodyEl, this.preId);

    const language = detectOutputLanguage(text, this.defaultLanguage);
    if (language === 'json') {
      const parsed = parseJsonValue(text);
      if (parsed.ok) {
        const previous = pre.querySelector('.json-tree');
        const expansion =
          previous instanceof HTMLElement
            ? collectExpansionState(previous)
            : undefined;
        const tree = renderJsonTree(parsed.value);
        if (expansion !== undefined) {
          applyExpansionState(tree, expansion);
        }
        pre.replaceChildren(tree);
        syncCopyButton();
        return;
      }
    }

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

export type IrMetricsPanelRef = Readonly<IrMetricsPanel>;

export type CopyablePanel = {
  readonly tabId: OutputTabId;
  readonly rawText: string;
};

export type OutputPanelSet = {
  readonly pipeline: OutputPanelRef;
  readonly irMetrics: IrMetricsPanelRef;
  readonly php: OutputPanelRef;
};

const outputPanels: OutputPanel[] = [];
let irMetricsPanel: IrMetricsPanel | undefined;
let activeOutputTab: OutputTabId = 'php';

const copyBtn = document.querySelector<HTMLButtonElement>('#output-copy')!;
const copyStatus = document.querySelector<HTMLElement>('#copy-status');
let copyStatusTimeoutId: ReturnType<typeof setTimeout> | undefined;

const OUTPUT_PRE_LABELS: Record<string, string> = {
  'pipeline-output': 'Pipeline output',
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
  if (activeOutputTab === 'ir-metrics' && irMetricsPanel !== undefined) {
    return irMetricsPanel;
  }
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
  const metricsBody = document.querySelector<HTMLElement>(
    '#ir-metrics-output-body',
  )!;
  irMetricsPanel = new IrMetricsPanel(metricsBody);
  setupPipelineTreeActions();
  return {
    pipeline: setupOutputPanel(
      'pipeline',
      'pipeline-output-body',
      'pipeline-output',
      'json',
    ),
    irMetrics: irMetricsPanel,
    php: setupOutputPanel('php', 'php-output-body', 'php-output', 'php'),
  };
}

function setupPipelineTreeActions(): void {
  const expandBtn = document.querySelector<HTMLButtonElement>(
    '#pipeline-expand-all',
  );
  const collapseBtn = document.querySelector<HTMLButtonElement>(
    '#pipeline-collapse-all',
  );
  expandBtn?.addEventListener('click', () => {
    setPipelineTreeExpanded(true);
  });
  collapseBtn?.addEventListener('click', () => {
    setPipelineTreeExpanded(false);
  });
}

function setPipelineTreeExpanded(expanded: boolean): void {
  const tree = document.querySelector<HTMLElement>('#pipeline-output .json-tree');
  if (tree !== null) {
    setJsonTreeExpanded(tree, expanded);
  }
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
