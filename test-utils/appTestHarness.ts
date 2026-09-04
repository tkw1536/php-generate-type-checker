/** Shared happy-dom helpers for app UI tests. Not production code. */
import { vi } from 'vitest';
import indexHtml from '../index.html?raw';
import { INPUT_DEBOUNCE_MS } from '../src/ui/generate.ts';

export { INPUT_DEBOUNCE_MS };
export const DEFAULT_TYPE = `/**
 * @phpstan-type User array{id: int, email: non-empty-string, name?: string}
 */`;

export function extractBodyHtml(html: string): string {
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/iu);
  const body = bodyMatch?.[1];
  if (body === undefined || body === '') {
    throw new Error('index.html has no <body>');
  }
  return body.replaceAll(/<script\b[\s\S]*?<\/script>/giu, '');
}

export function themeToggleLabel(theme: string | undefined): string {
  if (theme === 'dark') {
    return 'Switch to light mode';
  }
  return 'Switch to dark mode';
}

function installMatchMedia(matches = false): void {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: vi.fn<(query: string) => MediaQueryList>().mockImplementation(
      (query: string): MediaQueryList => createMatchMediaList(query, matches),
    ),
  });
}

function createMatchMediaList(query: string, matches: boolean): MediaQueryList {
  const addEventListener = vi.fn<() => void>();
  const removeEventListener = vi.fn<() => void>();
  const dispatchEvent = vi.fn<() => boolean>().mockReturnValue(false);
  return Object.assign(
    {
      matches,
      media: query,
      onchange: null as MediaQueryList['onchange'],
      addEventListener,
      removeEventListener,
      dispatchEvent,
    },
    {
      addListener: addEventListener,
      removeListener: removeEventListener,
    },
  );
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
    .mockResolvedValue();

  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    writable: true,
    value: { writeText },
  });
  return writeText;
}

export async function bootApp(options?: {
  readonly hash?: string;
  readonly fakeTimers?: boolean;
}): Promise<{
  writeText: ReturnType<typeof vi.fn<(text: string) => Promise<void>>>;
}> {
  vi.resetModules();

  if (options?.fakeTimers === true) {
    vi.useFakeTimers();
  } else {
    vi.useRealTimers();
  }

  installLocalStorage();
  installMatchMedia(false);
  const writeText = installClipboard();

  window.history.replaceState(null, '', '/');
  if (options?.hash === undefined) {
    window.location.hash = '';
  } else {
    window.location.hash = options.hash;
  }

  document.body.innerHTML = extractBodyHtml(indexHtml);

  await import('../src/main.ts');
  return { writeText };
}

export function typeInput(): HTMLTextAreaElement {
  return document.querySelector('#type-input')!;
}

export function phpCodeText(): string {
  return document.querySelector('#php-output code')?.textContent ?? '';
}

export function irOptimizedText(): string {
  return (
    document.querySelector('#ir-optimized-output code')?.textContent ?? ''
  );
}

export function astCodeText(): string {
  return document.querySelector('#ast-output code')?.textContent ?? '';
}

export function setInputValue(value: string): void {
  const input = typeInput();
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

export function flushDebounce(): void {
  vi.advanceTimersByTime(INPUT_DEBOUNCE_MS);
}
