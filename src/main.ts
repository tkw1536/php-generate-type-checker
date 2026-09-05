import './style.css';
import { initTheme, toggleTheme } from './theme.ts';
import { setupHelpTooltips } from './ui/accessibility.ts';
import { TYPE_EXAMPLES } from './ui/examples.ts';
import {
  bindGeneratePanels,
  generateNow,
  initTypeInputFromFragment,
  onGenerateInputChanged,
  runGenerate,
} from './ui/generate.ts';
import {
  refreshAllHighlights,
  setupCopyButton,
  setupOutputPanels,
} from './ui/outputPanel.ts';
import { setupOutputTabs } from './ui/outputTabs.ts';

initTheme();

const outputPanelSet = setupOutputPanels();
bindGeneratePanels(outputPanelSet);
setupCopyButton();

const typeInput = document.querySelector<HTMLTextAreaElement>('#type-input')!;
const outputModeSelect =
  document.querySelector<HTMLSelectElement>('#generate-output-mode')!;
const nameByTypeCheckbox =
  document.querySelector<HTMLInputElement>('#generate-name-by-type')!;
const prioritizeReadabilityCheckbox = document.querySelector<HTMLInputElement>(
  '#generate-prioritize-readability',
)!;
const verbosePhpdocCheckbox = document.querySelector<HTMLInputElement>(
  '#generate-verbose-phpdoc',
)!;
const emitAliasesCheckbox =
  document.querySelector<HTMLInputElement>('#generate-emit-aliases')!;
const resolveAliasesCheckbox = document.querySelector<HTMLInputElement>(
  '#generate-resolve-aliases',
)!;

typeInput.addEventListener('input', onGenerateInputChanged);
outputModeSelect.addEventListener('change', generateNow);
nameByTypeCheckbox.addEventListener('change', generateNow);
prioritizeReadabilityCheckbox.addEventListener('change', generateNow);
verbosePhpdocCheckbox.addEventListener('change', generateNow);
emitAliasesCheckbox.addEventListener('change', generateNow);
resolveAliasesCheckbox.addEventListener('change', generateNow);

document
  .querySelector<HTMLButtonElement>('#theme-toggle')!
  .addEventListener('click', () => {
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
    select.append(option);
  }

  select.addEventListener('change', () => {
    const type = select.value;
    if (!type) {
      return;
    }
    input.value = type;
    select.value = '';
    generateNow();
  });
}

setupHelpTooltips();
setupOutputTabs();
setupExamples();
initTypeInputFromFragment();
runGenerate(outputPanelSet);
