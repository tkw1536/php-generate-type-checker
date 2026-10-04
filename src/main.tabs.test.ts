/** @vitest-environment happy-dom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  astCodeText,
  bootApp,
} from '../test-utils/appTestHarness.ts';

function resetDom(): void {
  vi.useRealTimers();
  document.body.innerHTML = '';
  window.location.hash = '';
}

async function switchesOutputTabsAndCopiesActivePanel(): Promise<void> {
  const { writeText } = await bootApp();

  const astTab = document.querySelector<HTMLButtonElement>('#output-tab-ast')!;
  astTab.click();

  expect(astTab.getAttribute('aria-selected')).toBe('true');
  expect(
    document.querySelector<HTMLElement>('#output-panel-ast')!.hidden,
  ).toBe(false);
  expect(
    document.querySelector<HTMLElement>('#output-panel-php')!.hidden,
  ).toBe(true);
  expect(astCodeText().length).toBeGreaterThan(0);

  const copyBtn = document.querySelector<HTMLButtonElement>('#output-copy')!;
  copyBtn.click();
  await vi.waitFor(() => {
    expect(copyBtn.textContent).toBe('Copied!');
  });

  expect(writeText).toHaveBeenCalledOnce();
  expect(writeText).toHaveBeenCalledWith(expect.stringContaining('"ast"'));
  expect(writeText.mock.calls[0][0]).not.toMatch(/^function /mu);
  expect(document.querySelector('#copy-status')!.textContent).toBe(
    'Copied to clipboard',
  );

  const phpTab = document.querySelector<HTMLButtonElement>('#output-tab-php')!;
  phpTab.click();
  expect(phpTab.getAttribute('aria-selected')).toBe('true');
  expect(
    document.querySelector<HTMLElement>('#output-panel-php')!.hidden,
  ).toBe(false);
}

async function copiesPhpFromActiveTab(): Promise<void> {
  const { writeText } = await bootApp();

  const copyBtn = document.querySelector<HTMLButtonElement>('#output-copy')!;
  expect(copyBtn.disabled).toBe(false);

  copyBtn.click();
  await vi.waitFor(() => {
    expect(copyBtn.textContent).toBe('Copied!');
  });

  expect(writeText).toHaveBeenCalledOnce();
  expect(writeText).toHaveBeenCalledWith(expect.stringContaining('function'));
  expect(document.querySelector('#copy-status')!.textContent).toBe(
    'Copied to clipboard',
  );
}

async function showsMetricsDiagramAndCopiesTsv(): Promise<void> {
  const { writeText } = await bootApp();

  const metricsTab = document.querySelector<HTMLButtonElement>(
    '#output-tab-ir-metrics',
  )!;
  metricsTab.click();

  expect(metricsTab.getAttribute('aria-selected')).toBe('true');
  const panel = document.querySelector<HTMLElement>('#output-panel-ir-metrics')!;
  expect(panel.hidden).toBe(false);
  expect(panel.querySelector('.metrics-pipeline')).not.toBeNull();
  expect(panel.querySelector('.metrics-stages-header')).not.toBeNull();
  expect(panel.querySelector('.optimize-diagram')).not.toBeNull();
  expect(panel.querySelector('[data-decision="outer"]')).not.toBeNull();
  expect(panel.querySelector('[data-decision="inner"]')).not.toBeNull();
  expect(panel.querySelector('[data-pass="inline"]')).not.toBeNull();
  expect(panel.querySelector('.metrics-help')).not.toBeNull();
  expect(panel.querySelector('.ir-metrics-table')).toBeNull();

  const copyBtn = document.querySelector<HTMLButtonElement>('#output-copy')!;
  copyBtn.click();
  await vi.waitFor(() => {
    expect(copyBtn.textContent).toBe('Copied!');
  });

  expect(writeText).toHaveBeenCalledOnce();
  const copied = writeText.mock.calls[0][0];
  expect(copied).toContain('Parse\t');
  expect(copied).toContain('Inline helpers\t');
  expect(copied).toContain('Block rounds\t');
}

async function movesFocusAcrossTabsWithKeyboard(): Promise<void> {
  await bootApp();

  const phpTab = document.querySelector<HTMLButtonElement>('#output-tab-php')!;
  const astTab = document.querySelector<HTMLButtonElement>('#output-tab-ast')!;
  phpTab.focus();

  // Listener is on the tablist; target must be the focused tab button.
  phpTab.dispatchEvent(
    new KeyboardEvent('keydown', {
      key: 'ArrowRight',
      bubbles: true,
      cancelable: true,
    }),
  );
  expect(document.activeElement).toBe(astTab);

  astTab.dispatchEvent(
    new KeyboardEvent('keydown', {
      key: 'Enter',
      bubbles: true,
      cancelable: true,
    }),
  );

  expect(astTab.getAttribute('aria-selected')).toBe('true');
  expect(
    document.querySelector<HTMLElement>('#output-panel-ast')!.hidden,
  ).toBe(false);
}

describe('app UI output tabs', () => {
  afterEach(resetDom);

  it(
    'switches output tabs and copies the active panel text',
    switchesOutputTabsAndCopiesActivePanel,
  );
  it(
    'copies PHP from the active tab and announces status',
    copiesPhpFromActiveTab,
  );
  it(
    'moves focus across output tabs with ArrowRight and activates with Enter',
    movesFocusAcrossTabsWithKeyboard,
  );
  it(
    'shows Metrics optimizer diagram and copies TSV',
    showsMetricsDiagramAndCopiesTsv,
  );
});
