/** @vitest-environment happy-dom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  bootApp,
  pipelineCodeText,
} from '../test-utils/appTestHarness.ts';
import {
  expectFactDetail,
  expectOptimizeTraceChrome,
} from '../test-utils/optimizeTraceTestHelpers.ts';
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

type FooterPanes = {
  readonly footer: HTMLElement;
  readonly php: HTMLElement;
  readonly pipeline: HTMLElement;
  readonly metrics: HTMLElement;
  readonly trace: HTMLElement;
};

function footerPanes(): FooterPanes {
  return {
    footer: document.querySelector<HTMLElement>('#output-footer')!,
    php: document.querySelector<HTMLElement>('[data-output-footer="php"]')!,
    pipeline: document.querySelector<HTMLElement>(
      '[data-output-footer="pipeline"]',
    )!,
    metrics: document.querySelector<HTMLElement>(
      '[data-output-footer="ir-metrics"]',
    )!,
    trace: document.querySelector<HTMLElement>(
      '[data-output-footer="optimize-trace"]',
    )!,
  };
}

function expectDefaultPhpFooter(panes: FooterPanes): void {
  expect(panes.footer.classList.contains('panel-footer--caution')).toBe(true);
  expect(panes.footer.classList.contains('panel-footer--warning')).toBe(false);
  expect(panes.php.hidden).toBe(false);
  expect(panes.pipeline.hidden).toBe(true);
  expect(panes.php.textContent).toMatch(/Always review generated PHP/u);
}

function expectUnsealWarningFooter(panes: FooterPanes): void {
  document.querySelector<HTMLInputElement>(
    '#generate-unseal-array-shapes',
  )!.checked = true;
  document
    .querySelector<HTMLInputElement>('#generate-unseal-array-shapes')!
    .dispatchEvent(new Event('change'));
  expect(panes.footer.classList.contains('panel-footer--warning')).toBe(true);
  expect(panes.footer.classList.contains('panel-footer--caution')).toBe(false);
  expect(panes.php.textContent).toMatch(/unsound/iu);
  expect(
    document
      .querySelector('#unseal-array-shapes-unsound-badge')!
      .classList.contains('option-unsound-badge--active'),
  ).toBe(true);
}

function expectFooterAfterTabClicks(panes: FooterPanes): void {
  document.querySelector<HTMLButtonElement>('#output-tab-pipeline')!.click();
  expect(panes.footer.classList.contains('panel-footer--info')).toBe(true);
  expect(panes.footer.classList.contains('panel-footer--warning')).toBe(false);
  expect(panes.footer.classList.contains('panel-footer--caution')).toBe(false);
  expect(panes.pipeline.hidden).toBe(false);
  expect(panes.php.hidden).toBe(true);
  expect(panes.pipeline.textContent).toMatch(/checker IR/u);
  expect(panes.pipeline.querySelector('#pipeline-expand-all')).not.toBeNull();

  document.querySelector<HTMLButtonElement>('#output-tab-ir-metrics')!.click();
  expect(panes.metrics.hidden).toBe(false);
  expect(panes.pipeline.hidden).toBe(true);
  expect(panes.metrics.textContent).toMatch(/Render/u);

  document
    .querySelector<HTMLButtonElement>('#output-tab-optimize-trace')!
    .click();
  expect(panes.trace.hidden).toBe(false);
  expect(panes.metrics.hidden).toBe(true);
  expect(panes.trace.textContent).toMatch(/Initial checker/u);
}

async function swapsFooterHelpByTab(): Promise<void> {
  await bootApp();
  const panes = footerPanes();
  expectDefaultPhpFooter(panes);
  expectUnsealWarningFooter(panes);
  expectFooterAfterTabClicks(panes);
  expect(panes.footer.hidden).toBe(false);
}

function listUnionTraceHash(): string {
  return `#${encodeFragmentState({
    optimize: true,
    verbosePhpdoc: false,
    unsealArrayShapes: false,
    emit: 'function',
    emitAliases: false,
    resolveAliases: true,
    input: 'list<mixed>|list<string>',
  })}`;
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
