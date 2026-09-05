/** @vitest-environment happy-dom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { encodeFragmentState } from './ui/fragmentState.ts';
import {
  DEFAULT_TYPE,
  bootApp,
  flushDebounce,
  irOptimizedText,
  phpCodeText,
  setInputValue,
  themeToggleLabel,
  typeInput,
} from '../test-utils/appTestHarness.ts';

function resetDom(): void {
  vi.useRealTimers();
  document.body.innerHTML = '';
  window.location.hash = '';
}

async function bootsWithDefaultTypeAndPhp(): Promise<void> {
  await bootApp();

  expect(typeInput().value).toBe(DEFAULT_TYPE);

  const phpTab = document.querySelector('#output-tab-php')!;
  expect(phpTab.getAttribute('aria-selected')).toBe('true');
  expect(phpTab.classList.contains('active')).toBe(true);

  const phpPanel = document.querySelector<HTMLElement>('#output-panel-php')!;
  expect(phpPanel.hidden).toBe(false);
  expect(phpPanel.classList.contains('active')).toBe(true);

  expect(phpCodeText()).toContain('function');
  expect(
    document.querySelector<HTMLButtonElement>('#output-copy')!.disabled,
  ).toBe(false);
}

async function restoresControlsFromUrlFragment(): Promise<void> {
  const fragment = encodeFragmentState({
    nameFromType: false,
    optimize: true,
    verbosePhpdoc: true,
    emit: 'public_static',
    emitAliases: false,
    resolveAliases: false,
    input: 'int',
  });

  await bootApp({ hash: `#${fragment}` });

  expect(typeInput().value).toBe('int');
  expect(
    document.querySelector<HTMLInputElement>('#generate-name-by-type')!.checked,
  ).toBe(false);
  expect(
    document.querySelector<HTMLInputElement>(
      '#generate-prioritize-readability',
    )!.checked,
  ).toBe(true);
  expect(
    document.querySelector<HTMLInputElement>('#generate-verbose-phpdoc')!
      .checked,
  ).toBe(true);
  expect(
    document.querySelector<HTMLSelectElement>('#generate-output-mode')!.value,
  ).toBe('public_static');

  const php = phpCodeText();
  expect(php).toContain('public static function');
  expect(php).toMatch(/function check\b/u);
  expect(php).toContain('Checks if the given value is an int.');
  expect(php).toContain('@return bool');
}

async function togglesThemeOnDocument(): Promise<void> {
  await bootApp();

  const toggle = document.querySelector<HTMLButtonElement>('#theme-toggle')!;
  const before = document.documentElement.dataset.theme;
  expect(['light', 'dark']).toContain(before);

  toggle.click();

  const after = document.documentElement.dataset.theme;
  expect(after).not.toBe(before);
  expect(toggle.getAttribute('aria-label')).toBe(themeToggleLabel(after));
}

async function loadsExampleIntoTextarea(): Promise<void> {
  await bootApp();

  const select = document.querySelector<HTMLSelectElement>('#type-example')!;
  const option = [...select.options].find(
    (o) => o.value === 'array<string, string>',
  );
  expect(option).toBeTruthy();

  select.value = option!.value;
  select.dispatchEvent(new Event('change', { bubbles: true }));

  expect(typeInput().value).toBe('array<string, string>');
  expect(select.value).toBe('');
  expect(phpCodeText()).toContain('function');
  expect(window.location.hash).toContain(
    encodeURIComponent('array<string, string>').replaceAll('%20', '+'),
  );
}

async function debouncesInputThenUpdatesPhpAndHash(): Promise<void> {
  await bootApp({ fakeTimers: true });

  const generating = document.querySelector<HTMLElement>(
    '#output-generating',
  )!;
  expect(generating.hidden).toBe(true);

  setInputValue('string');

  expect(generating.hidden).toBe(false);
  expect(
    document
      .querySelector('.panel-body--output')!
      .classList.contains('panel-body--pending'),
  ).toBe(true);

  flushDebounce();

  expect(generating.hidden).toBe(true);
  expect(phpCodeText()).toContain('function');
  expect(phpCodeText().toLowerCase()).toContain('string');
  expect(window.location.hash).toContain('input=string');
}

async function updatesPhpWhenOptionsChange(): Promise<void> {
  await bootApp();

  const nameByType = document.querySelector<HTMLInputElement>(
    '#generate-name-by-type',
  )!;
  nameByType.checked = false;
  nameByType.dispatchEvent(new Event('change', { bubbles: true }));
  expect(phpCodeText()).toMatch(/function check\b/u);

  const optimize = document.querySelector<HTMLInputElement>(
    '#generate-prioritize-readability',
  )!;
  optimize.checked = false;
  optimize.dispatchEvent(new Event('change', { bubbles: true }));
  expect(irOptimizedText()).toMatch(/Optimizer skipped/iu);

  const verbose = document.querySelector<HTMLInputElement>(
    '#generate-verbose-phpdoc',
  )!;
  verbose.checked = true;
  verbose.dispatchEvent(new Event('change', { bubbles: true }));
  expect(phpCodeText()).toContain('@return bool');
  expect(phpCodeText()).toContain('TRUE if the given value is');

  const emit = document.querySelector<HTMLSelectElement>(
    '#generate-output-mode',
  )!;
  emit.value = 'public_static';
  emit.dispatchEvent(new Event('change', { bubbles: true }));
  expect(phpCodeText()).toContain('public static function');
}

describe('app UI boot', () => {
  afterEach(resetDom);

  it(
    'boots with default type, PHP tab active, and generated PHP',
    bootsWithDefaultTypeAndPhp,
  );
  it(
    'restores controls and output from the URL fragment',
    restoresControlsFromUrlFragment,
  );
  it(
    'toggles theme on the document and updates the button label',
    togglesThemeOnDocument,
  );
  it(
    'loads an example into the textarea and regenerates immediately',
    loadsExampleIntoTextarea,
  );
  it(
    'debounces input: shows generating, then updates PHP and hash',
    debouncesInputThenUpdatesPhpAndHash,
  );
  it(
    'updates PHP when naming, optimize, verbose PHPDoc, and emit options change',
    updatesPhpWhenOptionsChange,
  );
});
