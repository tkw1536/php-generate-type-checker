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

/** Compact (i) help control used in Metrics diagrams. */
export function renderMetricsHelp(
  helpId: string,
  label: string,
  help: string,
): string {
  return `<button
  type="button"
  class="option-help metrics-help"
  aria-label="Help: ${escapeAttr(label)}"
  aria-describedby="${helpId}"
  data-tooltip="${escapeAttr(help)}"
>i</button>
<span id="${helpId}" class="visually-hidden">${escapeHtml(help)}</span>`;
}

export function renderLabeledHelp(
  label: string,
  helpId: string,
  help: string,
  labelClass: string,
): string {
  return `<span class="${labelClass}">
  <span>${escapeHtml(label)}</span>
  ${renderMetricsHelp(helpId, label, help)}
</span>`;
}
