import hljsLightUrl from 'highlight.js/styles/github.min.css?url';
import hljsDarkUrl from 'highlight.js/styles/github-dark.min.css?url';

export type ThemePreference = 'light' | 'dark';
export type ResolvedTheme = ThemePreference;

const STORAGE_KEY = 'php-type-checker-theme';

let hljsLink: HTMLLinkElement | null = null;

function getStoredPreference(): ThemePreference | null {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === 'light' || stored === 'dark') {
    return stored;
  }
  return null;
}

function systemPrefersDark(): boolean {
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export function resolveTheme(): ResolvedTheme {
  return getStoredPreference() ?? (systemPrefersDark() ? 'dark' : 'light');
}

function applyHljsStylesheet(theme: ResolvedTheme): void {
  if (!hljsLink) {
    hljsLink = document.createElement('link');
    hljsLink.id = 'hljs-theme';
    hljsLink.rel = 'stylesheet';
    document.head.appendChild(hljsLink);
  }
  hljsLink.href = theme === 'dark' ? hljsDarkUrl : hljsLightUrl;
}

export function applyTheme(theme: ResolvedTheme): void {
  document.documentElement.dataset.theme = theme;
  applyHljsStylesheet(theme);
  updateThemeToggleLabel(theme);
}

function updateThemeToggleLabel(theme: ResolvedTheme): void {
  const btn = document.querySelector<HTMLButtonElement>('#theme-toggle');
  if (!btn) {
    return;
  }
  if (theme === 'dark') {
    btn.textContent = 'Light mode';
    btn.setAttribute('aria-label', 'Switch to light mode');
  } else {
    btn.textContent = 'Dark mode';
    btn.setAttribute('aria-label', 'Switch to dark mode');
  }
}

export function initTheme(): ResolvedTheme {
  const theme = resolveTheme();
  applyTheme(theme);

  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (getStoredPreference() === null) {
      applyTheme(resolveTheme());
      document.dispatchEvent(new CustomEvent('themechange'));
    }
  });

  return theme;
}

export function toggleTheme(): ResolvedTheme {
  const next: ThemePreference = resolveTheme() === 'dark' ? 'light' : 'dark';
  localStorage.setItem(STORAGE_KEY, next);
  applyTheme(next);
  document.dispatchEvent(new CustomEvent('themechange'));
  return next;
}

export function resetThemeToSystem(): void {
  localStorage.removeItem(STORAGE_KEY);
  const theme = resolveTheme();
  applyTheme(theme);
}
