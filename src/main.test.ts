/** @vitest-environment happy-dom */
import {
  afterEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import indexHtml from '../index.html?raw';
import { encodeFragmentState } from './ui/fragmentState.ts';

const INPUT_DEBOUNCE_MS = 250;
const DEFAULT_TYPE =
  'array{id: int, email: non-empty-string, name?: string}';

function extractBodyHtml(html: string): string {
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  if (!bodyMatch?.[1]) {
    throw new Error('index.html has no <body>');
  }
  return bodyMatch[1].replace(/<script\b[\s\S]*?<\/script>/gi, '');
}

function installMatchMedia(matches = false): void {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: vi.fn<(query: string) => MediaQueryList>().mockImplementation(
      (query: string) => ({
        matches,
        media: query,
        onchange: null,
        addListener: vi.fn<() => void>(),
        removeListener: vi.fn<() => void>(),
        addEventListener: vi.fn<() => void>(),
        removeEventListener: vi.fn<() => void>(),
        dispatchEvent: vi.fn<() => boolean>(),
      }),
    ),
  });
}

function installLocalStorage(): void {
  const store = new Map<string, string>();
  const localStorageMock: Storage = {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key: string) {
      return store.has(key) ? store.get(key)! : null;
    },
    key(index: number) {
      return [...store.keys()][index] ?? null;
    },
    removeItem(key: string) {
      store.delete(key);
    },
    setItem(key: string, value: string) {
      store.set(key, value);
    },
  };
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    writable: true,
    value: localStorageMock,
  });
}

function installClipboard(): ReturnType<
  typeof vi.fn<(text: string) => Promise<void>>
> {
  const writeText = vi
    .fn<(text: string) => Promise<void>>()
    .mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    writable: true,
    value: { writeText },
  });
  return writeText;
}

async function bootApp(options?: {
  hash?: string;
  fakeTimers?: boolean;
}): Promise<{
  writeText: ReturnType<typeof vi.fn<(text: string) => Promise<void>>>;
}> {
  vi.resetModules();

  if (options?.fakeTimers) {
    vi.useFakeTimers();
  } else {
    vi.useRealTimers();
  }

  installLocalStorage();
  installMatchMedia(false);
  const writeText = installClipboard();

  window.history.replaceState(null, '', '/');
  if (options?.hash !== undefined) {
    window.location.hash = options.hash;
  } else {
    window.location.hash = '';
  }

  document.body.innerHTML = extractBodyHtml(indexHtml);

  await import('./main.ts');
  return { writeText };
}

function typeInput(): HTMLTextAreaElement {
  return document.querySelector('#type-input')!;
}

function phpCodeText(): string {
  return document.querySelector('#php-output code')?.textContent ?? '';
}

function irOptimizedText(): string {
  return (
    document.querySelector('#ir-optimized-output code')?.textContent ?? ''
  );
}

function astCodeText(): string {
  return document.querySelector('#ast-output code')?.textContent ?? '';
}

function setInputValue(value: string): void {
  const input = typeInput();
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

function flushDebounce(): void {
  vi.advanceTimersByTime(INPUT_DEBOUNCE_MS);
}

describe('app UI (main.ts)', () => {
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
    expect(php).toMatch(/function check\b/);
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
    expect(phpCodeText()).toMatch(/function check\b/);

    const optimize = document.querySelector<HTMLInputElement>(
      '#generate-prioritize-readability',
    )!;
    optimize.checked = false;
    optimize.dispatchEvent(new Event('change', { bubbles: true }));
    expect(irOptimizedText()).toMatch(/Optimizer skipped/i);

    const emit = document.querySelector<HTMLSelectElement>(
      '#generate-output-mode',
    )!;
    emit.value = 'public_static';
    emit.dispatchEvent(new Event('change', { bubbles: true }));
    expect(phpCodeText()).toContain('public static function');
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
      encodeURIComponent('array<string, string>').replace(/%20/g, '+'),
    );
  });

  it('switches output tabs and copies the active panel text', async () => {
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
    expect(writeText.mock.calls[0][0]).not.toMatch(/^function /m);
    expect(document.querySelector('#copy-status')!.textContent).toBe(
      'Copied to clipboard',
    );

    const phpTab = document.querySelector<HTMLButtonElement>('#output-tab-php')!;
    phpTab.click();
    expect(phpTab.getAttribute('aria-selected')).toBe('true');
    expect(
      document.querySelector<HTMLElement>('#output-panel-php')!.hidden,
    ).toBe(false);
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

  it('toggles theme on the document and updates the button label', async () => {
    await bootApp();

    const toggle = document.querySelector<HTMLButtonElement>('#theme-toggle')!;
    const before = document.documentElement.dataset.theme;
    expect(before === 'light' || before === 'dark').toBe(true);

    toggle.click();

    const after = document.documentElement.dataset.theme;
    expect(after).not.toBe(before);
    expect(toggle.getAttribute('aria-label')).toBe(
      after === 'dark' ? 'Switch to light mode' : 'Switch to dark mode',
    );
  });

  it('copies PHP from the active tab and announces status', async () => {
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
  });

  it('moves focus across output tabs with ArrowRight and activates with Enter', async () => {
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
  });
});
