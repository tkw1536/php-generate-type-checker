function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function escapeAttr(text: string): string {
  return escapeHtml(text).replaceAll("'", '&#39;');
}

/** Compact (?) help control for Optimize Trace rule explanations. */
export function renderTraceRuleHelp(
  helpId: string,
  label: string,
  help: string,
): string {
  return `<button
  type="button"
  class="option-help optimize-trace-rule-help"
  aria-label="Help: ${escapeAttr(label)}"
  aria-describedby="${helpId}"
  data-tooltip="${escapeAttr(help)}"
>?</button>
<span id="${helpId}" class="visually-hidden">${escapeHtml(help)}</span>`;
}
