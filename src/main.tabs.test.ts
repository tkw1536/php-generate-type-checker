/** @vitest-environment happy-dom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  bootApp,
  typeAstCodeText,
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

  const typeTab = document.querySelector<HTMLButtonElement>(
    '#output-tab-type',
  )!;
  typeTab.click();

  expect(typeTab.getAttribute('aria-selected')).toBe('true');
  expect(
    document.querySelector<HTMLElement>('#output-panel-type')!.hidden,
  ).toBe(false);
  expect(
    document.querySelector<HTMLElement>('#output-panel-php')!.hidden,
  ).toBe(true);
  expect(typeAstCodeText().length).toBeGreaterThan(0);
  expect(typeAstCodeText()).toContain('aliasName');
  expect(typeAstCodeText()).toContain('UserAddress');

  const copyBtn = document.querySelector<HTMLButtonElement>('#output-copy')!;
  copyBtn.click();
  await vi.waitFor(() => {
    expect(copyBtn.textContent).toBe('Copied!');
  });

  expect(writeText).toHaveBeenCalledOnce();
  const copied = writeText.mock.calls[0][0];
  expect(copied).toContain('"aliasName"');
  expect(copied).toContain('UserAddress');
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

type FooterPanes = {
  readonly footer: HTMLElement;
  readonly php: HTMLElement;
  readonly type: HTMLElement;
  readonly trace: HTMLElement;
};

function footerPanes(): FooterPanes {
  return {
    footer: document.querySelector<HTMLElement>('#output-footer')!,
    php: document.querySelector<HTMLElement>('[data-output-footer="php"]')!,
    type: document.querySelector<HTMLElement>(
      '[data-output-footer="type"]',
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
  expect(panes.type.hidden).toBe(true);
  expect(panes.php.textContent).toMatch(/Always review generated PHP/u);
}

function expectUnsafeKeysWarningFooter(panes: FooterPanes): void {
  document.querySelector<HTMLInputElement>(
    '#generate-unsafe-string-array-keys',
  )!.checked = true;
  document
    .querySelector<HTMLInputElement>('#generate-unsafe-string-array-keys')!
    .dispatchEvent(new Event('change'));
  expect(panes.footer.classList.contains('panel-footer--warning')).toBe(true);
  expect(panes.footer.classList.contains('panel-footer--caution')).toBe(false);
  expect(panes.php.textContent).toMatch(/unsound/iu);
  expect(
    document
      .querySelector('#unsafe-string-array-keys-unsound-badge')!
      .classList.contains('option-unsound-badge--active'),
  ).toBe(true);
}

function expectFooterAfterTabClicks(panes: FooterPanes): void {
  document.querySelector<HTMLButtonElement>('#output-tab-type')!.click();
  expect(panes.footer.classList.contains('panel-footer--info')).toBe(true);
  expect(panes.footer.classList.contains('panel-footer--warning')).toBe(false);
  expect(panes.footer.classList.contains('panel-footer--caution')).toBe(false);
  expect(panes.type.hidden).toBe(false);
  expect(panes.php.hidden).toBe(true);
  expect(panes.type.textContent).toMatch(/Parsed type AST/u);
  expect(panes.type.querySelector('#type-expand-all')).not.toBeNull();

  document
    .querySelector<HTMLButtonElement>('#output-tab-optimize-trace')!
    .click();
  expect(panes.trace.hidden).toBe(false);
  expect(panes.type.hidden).toBe(true);
  expect(panes.trace.textContent).toMatch(/Initial checker/u);
}

async function swapsFooterHelpByTab(): Promise<void> {
  await bootApp();
  const panes = footerPanes();
  expectDefaultPhpFooter(panes);
  expectUnsafeKeysWarningFooter(panes);
  expectFooterAfterTabClicks(panes);
  expect(panes.footer.hidden).toBe(false);
}

function listUnionTraceHash(): string {
  return `#${encodeFragmentState({
    optimize: true,
    verbosePhpdoc: false,
    unsafeStringArrayKeys: false,
    sealArrayShapes: false,
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
  const typeTab = document.querySelector<HTMLButtonElement>(
    '#output-tab-type',
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
  expect(document.activeElement).toBe(typeTab);

  typeTab.dispatchEvent(
    new KeyboardEvent('keydown', {
      key: 'Enter',
      bubbles: true,
      cancelable: true,
    }),
  );

  expect(typeTab.getAttribute('aria-selected')).toBe('true');
  expect(
    document.querySelector<HTMLElement>('#output-panel-type')!.hidden,
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
    'shows Optimize Trace list and copies selected PHP',
    showsOptimizeTraceListAndCopiesPhp,
  );
});
