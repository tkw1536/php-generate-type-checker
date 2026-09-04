/** @vitest-environment happy-dom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  bootApp,
  flushDebounce,
  phpCodeText,
  setInputValue,
} from '../test-utils/appTestHarness.ts';

describe('app UI generate', () => {
  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = '';
    window.location.hash = '';
  });

  it('shows an error display when the type cannot be parsed', async () => {
    await bootApp({ fakeTimers: true });

    setInputValue('array<string,');
    flushDebounce();

    const phpBody = document.querySelector('#php-output-body')!;
    expect(phpBody.classList.contains('panel-body--error')).toBe(true);
    expect(phpBody.querySelector('.error-display')).toBeTruthy();

    const astBody = document.querySelector('#ast-output-body')!;
    expect(astBody.classList.contains('panel-body--error')).toBe(true);
    expect(astBody.querySelector('.error-display')).toBeTruthy();
  });

  it('reveals docblock options and can emit @phpstan-type aliases', async () => {
    await bootApp({ fakeTimers: true });

    const docblockOptions = document.querySelector<HTMLElement>(
      '#generate-docblock-options',
    )!;
    expect(docblockOptions.hidden).toBe(true);

    const docblock = `/**
 * @phpstan-type UserId int
 */`;
    setInputValue(docblock);
    flushDebounce();

    expect(docblockOptions.hidden).toBe(false);

    const emitAliases = document.querySelector<HTMLInputElement>(
      '#generate-emit-aliases',
    )!;
    emitAliases.checked = true;
    emitAliases.dispatchEvent(new Event('change', { bubbles: true }));

    expect(phpCodeText()).toContain('@phpstan-type');
    expect(phpCodeText()).toContain('UserId');
  });
});
