/** @vitest-environment happy-dom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  bootApp,
  pipelineCodeText,
} from '../test-utils/appTestHarness.ts';
import { encodeFragmentState } from './ui/fragmentState.ts';

function resetDom(): void {
  vi.useRealTimers();
  document.body.innerHTML = '';
  window.location.hash = '';
}

async function switchesOutputTabsAndCopiesActivePanel(): Promise<void> {
  const { writeText } = await bootApp();

  const pipelineTab = document.querySelector<HTMLButtonElement>(
    '#output-tab-pipeline',
  )!;
  pipelineTab.click();

  expect(pipelineTab.getAttribute('aria-selected')).toBe('true');
  expect(
    document.querySelector<HTMLElement>('#output-panel-pipeline')!.hidden,
  ).toBe(false);
  expect(
    document.querySelector<HTMLElement>('#output-panel-php')!.hidden,
  ).toBe(true);
  expect(pipelineCodeText().length).toBeGreaterThan(0);
  expect(pipelineCodeText()).toContain('Parse');
  expect(pipelineCodeText()).toContain('Generate');
  expect(pipelineCodeText()).toContain('Optimize');

  const copyBtn = document.querySelector<HTMLButtonElement>('#output-copy')!;
  copyBtn.click();
  await vi.waitFor(() => {
    expect(copyBtn.textContent).toBe('Copied!');
  });

  expect(writeText).toHaveBeenCalledOnce();
  const copied = writeText.mock.calls[0][0];
  expect(copied).toContain('"Parse"');
  expect(copied).toContain('"Generate"');
  expect(copied).toContain('"Optimize"');
  expect(copied).not.toMatch(/^function /mu);
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

async function swapsFooterHelpByTab(): Promise<void> {
  await bootApp();

  const footer = document.querySelector<HTMLElement>('#output-footer')!;
  const phpPane = document.querySelector<HTMLElement>(
    '[data-output-footer="php"]',
  )!;
  const pipelinePane = document.querySelector<HTMLElement>(
    '[data-output-footer="pipeline"]',
  )!;
  const metricsPane = document.querySelector<HTMLElement>(
    '[data-output-footer="ir-metrics"]',
  )!;
  const tracePane = document.querySelector<HTMLElement>(
    '[data-output-footer="optimize-trace"]',
  )!;

  expect(footer.classList.contains('panel-footer--warning')).toBe(true);
  expect(phpPane.hidden).toBe(false);
  expect(pipelinePane.hidden).toBe(true);

  document.querySelector<HTMLButtonElement>('#output-tab-pipeline')!.click();
  expect(footer.classList.contains('panel-footer--info')).toBe(true);
  expect(footer.classList.contains('panel-footer--warning')).toBe(false);
  expect(pipelinePane.hidden).toBe(false);
  expect(phpPane.hidden).toBe(true);
  expect(pipelinePane.textContent).toMatch(/checker IR/u);
  expect(pipelinePane.querySelector('#pipeline-expand-all')).not.toBeNull();

  document.querySelector<HTMLButtonElement>('#output-tab-ir-metrics')!.click();
  expect(metricsPane.hidden).toBe(false);
  expect(pipelinePane.hidden).toBe(true);
  expect(metricsPane.textContent).toMatch(/Render/u);

  document
    .querySelector<HTMLButtonElement>('#output-tab-optimize-trace')!
    .click();
  expect(tracePane.hidden).toBe(false);
  expect(metricsPane.hidden).toBe(true);
  expect(tracePane.textContent).toMatch(/initial IR/u);
}

function listUnionTraceHash(): string {
  return `#${encodeFragmentState({
    optimize: true,
    verbosePhpdoc: false,
    emit: 'function',
    emitAliases: false,
    resolveAliases: true,
    input: 'list<mixed>|list<string>',
  })}`;
}

function expectOptimizeTraceChrome(panel: HTMLElement): void {
  expect(panel.querySelector('.optimize-trace-list')).not.toBeNull();
  expect(panel.querySelector('.optimize-trace-group')).not.toBeNull();
  expect(panel.querySelector('.optimize-trace-item')).not.toBeNull();
  expect(panel.querySelector('.optimize-trace-view-tabs')).not.toBeNull();
  expect(panel.querySelector('.optimize-trace-diff')).not.toBeNull();
  expect(panel.querySelector('.optimize-trace-title-text')).not.toBeNull();
  const ruleHelp = panel.querySelector<HTMLButtonElement>(
    '.optimize-trace-help .optimize-trace-rule-help',
  );
  expect(ruleHelp).not.toBeNull();
  expect(ruleHelp?.textContent).toBe('?');
  expect(ruleHelp?.dataset.tooltip?.length).toBeGreaterThan(20);
}

function expectFactDetail(panel: HTMLElement): void {
  const factItems = [
    ...panel.querySelectorAll<HTMLButtonElement>('.optimize-trace-item'),
  ].filter((item) => /prove|absorb/iu.test(item.textContent ?? ''));
  expect(factItems.length).toBeGreaterThan(0);
  factItems[0].click();
  expect(panel.querySelector('.optimize-trace-facts')).not.toBeNull();
  expect(panel.querySelector('.optimize-trace-fact-known')).not.toBeNull();
  expect(panel.querySelector('.optimize-trace-fact-source')).not.toBeNull();
  const factHelp = panel.querySelector<HTMLButtonElement>(
    '.optimize-trace-fact-source .optimize-trace-rule-help',
  );
  expect(factHelp).not.toBeNull();
  expect(factHelp?.dataset.tooltip?.length).toBeGreaterThan(10);
  expect(panel.querySelector('.optimize-trace-focus')).not.toBeNull();
  expect(panel.querySelector('.optimize-trace-meta-line')).not.toBeNull();
}

async function showsOptimizeTraceListAndCopiesPhp(): Promise<void> {
  const { writeText } = await bootApp({ hash: listUnionTraceHash() });

  const traceTab = document.querySelector<HTMLButtonElement>(
    '#output-tab-optimize-trace',
  )!;
  traceTab.click();

  const panel = document.querySelector<HTMLElement>(
    '#output-panel-optimize-trace',
  )!;
  expect(panel.hidden).toBe(false);
  expectOptimizeTraceChrome(panel);
  expect(panel.textContent).not.toMatch(/^\s*#\d+\s+\w+\./mu);
  expectFactDetail(panel);

  const copyBtn = document.querySelector<HTMLButtonElement>('#output-copy')!;
  copyBtn.click();
  await vi.waitFor(() => {
    expect(copyBtn.textContent).toBe('Copied!');
  });
  expect(writeText).toHaveBeenCalledOnce();
  const copied = writeText.mock.calls[0][0];
  expect(typeof copied).toBe('string');
  expect(copied.length).toBeGreaterThan(0);
}

async function movesFocusAcrossTabsWithKeyboard(): Promise<void> {
  await bootApp();

  const phpTab = document.querySelector<HTMLButtonElement>('#output-tab-php')!;
  const pipelineTab = document.querySelector<HTMLButtonElement>(
    '#output-tab-pipeline',
  )!;
  phpTab.focus();

  // Listener is on the tablist; target must be the focused tab button.
  phpTab.dispatchEvent(
    new KeyboardEvent('keydown', {
      key: 'ArrowRight',
      bubbles: true,
      cancelable: true,
    }),
  );
  expect(document.activeElement).toBe(pipelineTab);

  pipelineTab.dispatchEvent(
    new KeyboardEvent('keydown', {
      key: 'Enter',
      bubbles: true,
      cancelable: true,
    }),
  );

  expect(pipelineTab.getAttribute('aria-selected')).toBe('true');
  expect(
    document.querySelector<HTMLElement>('#output-panel-pipeline')!.hidden,
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
  it('swaps the output footer help by active tab', swapsFooterHelpByTab);
  it(
    'moves focus across output tabs with ArrowRight and activates with Enter',
    movesFocusAcrossTabsWithKeyboard,
  );
  it(
    'shows Metrics optimizer diagram and copies TSV',
    showsMetricsDiagramAndCopiesTsv,
  );
  it(
    'shows Optimize Trace list and copies selected PHP',
    showsOptimizeTraceListAndCopiesPhp,
  );
});
