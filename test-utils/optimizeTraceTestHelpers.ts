import { expect } from 'vitest';

export function expectOptimizeTraceChrome(panel: HTMLElement): void {
  expect(panel.querySelector('.optimize-trace-list')).not.toBeNull();
  expect(panel.querySelector('.optimize-trace-group')).not.toBeNull();
  expect(panel.querySelector('.optimize-trace-item')).not.toBeNull();
  expect(panel.querySelector('.optimize-trace-collapse')).not.toBeNull();
  expect(panel.querySelector('.optimize-trace-title-text')).not.toBeNull();
  const ruleHelp = panel.querySelector<HTMLButtonElement>(
    '.optimize-trace-help .optimize-trace-rule-help',
  );
  expect(ruleHelp).not.toBeNull();
  expect(ruleHelp?.textContent).toBe('?');
  expect(ruleHelp?.dataset.tooltip?.length).toBeGreaterThan(20);
  // Initial = full PHP pane; env-extend = facts; rewrites = Before/After/Diff.
  const initialPhp = panel.querySelector('.optimize-trace-pane');
  const envFacts = panel.querySelector('.optimize-trace-env-facts');
  const viewTabs = panel.querySelector('.optimize-trace-view-tabs');
  expect(initialPhp !== null || envFacts !== null || viewTabs !== null).toBe(
    true,
  );
  const initialItem = [
    ...panel.querySelectorAll<HTMLButtonElement>('.optimize-trace-item'),
  ].find((item) => /Initial checker/iu.test(item.textContent ?? ''));
  expect(initialItem).toBeDefined();
}

export function expectFactDetail(panel: HTMLElement): void {
  const envItem = [
    ...panel.querySelectorAll<HTMLButtonElement>('.optimize-trace-item'),
  ].find((item) => /Extend fact/iu.test(item.textContent ?? ''));
  if (envItem !== undefined) {
    envItem.click();
    expect(panel.querySelector('.optimize-trace-env-facts')).not.toBeNull();
    expect(panel.querySelector('.optimize-trace-fact-line')).not.toBeNull();
    expect(
      panel.querySelector(
        '.optimize-trace-fact-known--true, .optimize-trace-fact-known--false',
      ),
    ).not.toBeNull();
  }
  const proveItem = [
    ...panel.querySelectorAll<HTMLButtonElement>('.optimize-trace-item'),
  ].find((item) => /prove|absorb/iu.test(item.textContent ?? ''));
  expect(proveItem).toBeDefined();
  proveItem!.click();
  expect(panel.querySelector('.optimize-trace-view-tabs')).not.toBeNull();
  expect(panel.querySelector('.optimize-trace-title-text')).not.toBeNull();
}
