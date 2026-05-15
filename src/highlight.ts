import hljs from 'highlight.js/lib/core';
import json from 'highlight.js/lib/languages/json';
import php from 'highlight.js/lib/languages/php';

hljs.registerLanguage('json', json);
hljs.registerLanguage('php', php);

export type HighlightLanguage = 'php' | 'json';

export function highlightCode(code: string, language: HighlightLanguage): string {
  return hljs.highlight(code, { language }).value;
}

export function detectOutputLanguage(text: string, defaultLang: HighlightLanguage): HighlightLanguage {
  try {
    const parsed: unknown = JSON.parse(text);
    if (parsed !== null && typeof parsed === 'object' && 'error' in parsed) {
      return 'json';
    }
  } catch {
    // not JSON
  }
  return defaultLang;
}
