import { highlightCode } from '../highlight.ts';

export const PROOF_RELATION_TAB_LABELS = {
  before: 'Premise',
  after: 'Conclusion',
  diff: 'Compare',
} as const;

/** Matched fact → folded bool (facts.prove.equals). */
export const PROVE_EQUALS_TAB_LABELS = {
  before: 'Fact',
  after: 'Result',
  diff: 'Compare',
} as const;

/** Colored premise/conclusion lines — no hunk header, no +/- gutter. */
function renderProofCompareLine(
  text: string,
  kind: 'add' | 'del',
): HTMLElement {
  const row = document.createElement('div');
  row.className = `optimize-trace-diff-line optimize-trace-diff-line--no-gutter optimize-trace-diff-line--${kind}`;
  const code = document.createElement('code');
  code.className = 'hljs language-php';
  code.innerHTML = highlightCode(text === '' ? ' ' : text, 'php');
  row.append(code);
  return row;
}

/**
 * Stack premise (del color) then conclusion (add color) without Diff chrome.
 */
export function renderProofCompareView(
  premisePhp: string,
  conclusionPhp: string,
): HTMLElement {
  const el = document.createElement('div');
  el.className =
    'optimize-trace-pane optimize-trace-diff optimize-trace-proof-compare';
  el.setAttribute('aria-label', 'Premise and conclusion comparison');
  for (const line of premisePhp.split('\n')) {
    el.append(renderProofCompareLine(line, 'del'));
  }
  for (const line of conclusionPhp.split('\n')) {
    el.append(renderProofCompareLine(line, 'add'));
  }
  return el;
}
