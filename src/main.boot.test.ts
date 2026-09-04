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

describe('app UI boot', () => {
  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = '';
    window.location.hash = '';
  });

  it('boots with default type, PHP tab active, and generated PHP', async () => {
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
  });

  it('restores controls and output from the URL fragment', async () => {
    const fragment = encodeFragmentState({
      nameFromType: false,
      optimize: true,
      emit: 'public_static',
      emitAliases: false,
      resolveAliases: false,
      input: 'int',
    });

    await bootApp({ hash: `#${fragment}` });

    expect(typeInput().value).toBe('int');
    expect(
      document.querySelector<HTMLInputElement>('#generate-name-by-type')!
        .checked,
    ).toBe(false);
    expect(
      document.querySelector<HTMLInputElement>(
        '#generate-prioritize-readability',
      )!.checked,
    ).toBe(true);
    expect(
      document.querySelector<HTMLSelectElement>('#generate-output-mode')!.value,
    ).toBe('public_static');

    const php = phpCodeText();
    expect(php).toContain('public static function');
    expect(php).toMatch(/function check\b/u);
  });

  it('toggles theme on the document and updates the button label', async () => {
    await bootApp();

    const toggle = document.querySelector<HTMLButtonElement>('#theme-toggle')!;
    const before = document.documentElement.dataset.theme;
    expect(['light', 'dark']).toContain(before);

    toggle.click();

    const after = document.documentElement.dataset.theme;
    expect(after).not.toBe(before);
    expect(toggle.getAttribute('aria-label')).toBe(themeToggleLabel(after));
  });

  it('loads an example into the textarea and regenerates immediately', async () => {
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
  });

  it('debounces input: shows generating, then updates PHP and hash', async () => {
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
  });

  it('updates PHP when naming, optimize, and emit options change', async () => {
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

    const emit = document.querySelector<HTMLSelectElement>(
      '#generate-output-mode',
    )!;
    emit.value = 'public_static';
    emit.dispatchEvent(new Event('change', { bubbles: true }));
    expect(phpCodeText()).toContain('public static function');
  });
});
