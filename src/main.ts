import './style.css';
import { generateChecker, parseType, type CheckerOutputMode } from './index.ts';
import {
  detectOutputLanguage,
  highlightCode,
  type HighlightLanguage,
} from './highlight.ts';
import { initTheme, toggleTheme } from './theme.ts';
import { describeError, renderErrorHtml } from './ui/errorDisplay.ts';

initTheme();

const DEFAULT_TYPE = 'array<string, string>';

interface OutputPanel {
  bodyEl: HTMLElement;
  preId: string;
  copyBtn: HTMLButtonElement;
  defaultLanguage: HighlightLanguage;
  rawText: string;
}

const outputPanels: OutputPanel[] = [];

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

function setupOutputPanel(
  bodyId: string,
  preId: string,
  copyBtnId: string,
  defaultLanguage: HighlightLanguage,
): OutputPanel {
  const bodyEl = document.querySelector<HTMLElement>(`#${bodyId}`)!;
  const copyBtn = document.querySelector<HTMLButtonElement>(`#${copyBtnId}`)!;

  const panel: OutputPanel = {
    bodyEl,
    preId,
    copyBtn,
    defaultLanguage,
    rawText: '',
  };

  copyBtn.addEventListener('click', async () => {
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

  outputPanels.push(panel);
  return panel;
}

function setSuccessOutput(panel: OutputPanel, text: string): void {
  panel.rawText = text;
  panel.copyBtn.disabled = text.length === 0;
  panel.bodyEl.classList.remove('panel-body--error');

  const { code } = getPreAndCode(panel.bodyEl, panel.preId);

  const language = detectOutputLanguage(text, panel.defaultLanguage);
  code.className = `hljs language-${language}`;
  code.innerHTML = highlightCode(text, language);
}

function setErrorOutput(panel: OutputPanel, err: unknown, sourceText: string): void {
  const described = describeError(err);
  panel.rawText = described.message;
  panel.copyBtn.disabled = false;
  panel.bodyEl.classList.add('panel-body--error');
  panel.bodyEl.innerHTML = renderErrorHtml(described, sourceText);
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

function runGenerate(panel: OutputPanel): void {
  const input = document.querySelector<HTMLTextAreaElement>('#generate-input')!;
  const typeString = input.value.trim() || DEFAULT_TYPE;

  try {
    setSuccessOutput(
      panel,
      generateChecker(typeString, { output: getGenerateOutputMode() }),
    );
  } catch (err) {
    setErrorOutput(panel, err, typeString);
  }
}

function runParse(panel: OutputPanel): void {
  const input = document.querySelector<HTMLTextAreaElement>('#parse-input')!;
  const typeString = input.value.trim() || DEFAULT_TYPE;

  try {
    setSuccessOutput(panel, JSON.stringify(parseType(typeString), null, 2));
  } catch (err) {
    setErrorOutput(panel, err, typeString);
  }
}

function setupTabs(): void {
  const tabButtons = document.querySelectorAll<HTMLButtonElement>('.tab[data-tab]');
  const tabPanels = document.querySelectorAll<HTMLElement>('.tab-panel');

  tabButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const tabId = button.dataset.tab;
      if (!tabId) {
        return;
      }

      tabButtons.forEach((btn) => {
        const active = btn === button;
        btn.classList.toggle('active', active);
        btn.setAttribute('aria-selected', active ? 'true' : 'false');
      });

      tabPanels.forEach((p) => {
        const active = p.id === `tab-panel-${tabId}`;
        p.classList.toggle('active', active);
        p.hidden = !active;
      });
    });
  });
}

const generatePanel = setupOutputPanel(
  'generate-output-body',
  'generate-output',
  'generate-copy',
  'php',
);
const parsePanel = setupOutputPanel('parse-output-body', 'parse-output', 'parse-copy', 'json');

document.querySelector<HTMLButtonElement>('#generate-run')!.addEventListener('click', () => {
  runGenerate(generatePanel);
});

document.querySelector<HTMLButtonElement>('#parse-run')!.addEventListener('click', () => {
  runParse(parsePanel);
});

document.querySelector<HTMLButtonElement>('#theme-toggle')!.addEventListener('click', () => {
  toggleTheme();
});

document.addEventListener('themechange', () => {
  refreshAllHighlights();
});

setupTabs();

document.querySelector<HTMLTextAreaElement>('#generate-input')!.value = DEFAULT_TYPE;
document.querySelector<HTMLTextAreaElement>('#parse-input')!.value = DEFAULT_TYPE;
