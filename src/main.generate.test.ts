/** @vitest-environment happy-dom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  bootApp,
  flushDebounce,
  phpCodeText,
  setInputValue,
} from '../test-utils/appTestHarness.ts';

async function showsErrorDisplayWhenTypeCannotBeParsed(): Promise<void> {
  await bootApp({ fakeTimers: true });

  setInputValue('array<string,');
  flushDebounce();

  const phpBody = document.querySelector('#php-output-body')!;
  expect(phpBody.classList.contains('panel-body--error')).toBe(true);
  expect(phpBody.querySelector('.error-display')).toBeTruthy();
  expect(phpBody.textContent).toMatch(/Parse error/u);
  expect(phpBody.textContent).not.toMatch(/Parse failed/u);

  const astBody = document.querySelector('#ast-output-body')!;
  expect(astBody.classList.contains('panel-body--error')).toBe(true);
  expect(astBody.querySelector('.error-display')).toBeTruthy();
}

async function showsDuplicateAliasErrorOnPhpPanel(): Promise<void> {
  await bootApp({ fakeTimers: true });

  const input = `/**
 * @phpstan-type UserAccount int
 * @phpstan-type UserAccount string
 */`;
  setInputValue(input);
  flushDebounce();

  const phpBody = document.querySelector('#php-output-body')!;
  expect(phpBody.classList.contains('panel-body--error')).toBe(true);
  expect(phpBody.textContent).toMatch(/Duplicate @phpstan-type alias "UserAccount"/u);
  expect(phpBody.textContent).toMatch(/Invalid input/u);
  // Caret should sit under the duplicate alias name.
  const nameIndex = input.lastIndexOf('UserAccount');
  const lineStart = input.lastIndexOf('\n', nameIndex) + 1;
  const col = nameIndex - lineStart;
  expect(phpBody.innerHTML).toContain(
    `<pre class="error-caret">${' '.repeat(col)}^</pre>`,
  );
}

async function revealsDocblockOptionsAndCanEmitAliases(): Promise<void> {
  await bootApp({ fakeTimers: true });

  const docblockOptions = document.querySelectorAll<HTMLElement>(
    '.generate-docblock-option',
  );
  // Default input is a @phpstan-type docblock, so alias options start visible.
  flushDebounce();
  expect([...docblockOptions].every((el) => el.hidden === false)).toBe(true);

  setInputValue('array<string>');
  flushDebounce();
  expect([...docblockOptions].every((el) => el.hidden === true)).toBe(true);

  const docblock = `/**
 * @phpstan-type UserId int
 */`;
  setInputValue(docblock);
  flushDebounce();

  expect([...docblockOptions].every((el) => el.hidden === false)).toBe(true);

  const emitAliases = document.querySelector<HTMLInputElement>(
    '#generate-emit-aliases',
  )!;
  emitAliases.checked = true;
  emitAliases.dispatchEvent(new Event('change', { bubbles: true }));

  expect(phpCodeText()).toContain('@phpstan-type');
  expect(phpCodeText()).toContain('UserId');
}

describe('app UI generate', () => {
  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = '';
    window.location.hash = '';
  });

  it(
    'shows an error display when the type cannot be parsed',
    showsErrorDisplayWhenTypeCannotBeParsed,
  );

  it(
    'shows duplicate alias details on the PHP panel',
    showsDuplicateAliasErrorOnPhpPanel,
  );

  it(
    'reveals docblock options and can emit @phpstan-type aliases',
    revealsDocblockOptionsAndCanEmitAliases,
  );
});
