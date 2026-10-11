/**
 * Collapsed-by-default Trace detail section.
 * When `count` is set, the summary is `title (count)`; otherwise just `title`.
 */
export function wrapTraceFold(
  title: string,
  count: number | null,
  className: string,
  fillBody: (body: HTMLElement) => void,
): HTMLElement {
  const details = document.createElement('details');
  details.className = `optimize-trace-fold ${className}`;
  const summary = document.createElement('summary');
  summary.className = 'optimize-trace-fold-summary';
  summary.textContent = count === null ? title : `${title} (${count})`;
  const body = document.createElement('div');
  body.className = 'optimize-trace-fold-body';
  fillBody(body);
  details.append(summary, body);
  return details;
}
