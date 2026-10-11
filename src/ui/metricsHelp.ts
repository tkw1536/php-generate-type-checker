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
  return renderHelpButton(helpId, label, help, 'i', 'option-help metrics-help');
}

/** Compact (?) help control for Optimize Trace rule explanations. */
export function renderTraceRuleHelp(
  helpId: string,
  label: string,
  help: string,
): string {
  return renderHelpButton(
    helpId,
    label,
    help,
    '?',
    'option-help optimize-trace-rule-help',
  );
}

function renderHelpButton(
  helpId: string,
  label: string,
  help: string,
  glyph: string,
  className: string,
): string {
  return `<button
  type="button"
  class="${className}"
  aria-label="Help: ${escapeAttr(label)}"
  aria-describedby="${helpId}"
  data-tooltip="${escapeAttr(help)}"
>${glyph}</button>
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
