import {
  posToLineCol,
  type PositionedError,
} from '../describeError.ts';

export function renderErrorHtml(error: PositionedError, sourceText: string): string {
  const snippetSource = error.segmentSource ?? sourceText;
  const hasPosition =
    error.pos !== undefined && error.pos >= 0 && snippetSource.length > 0;
  const snippet = hasPosition ? buildSnippet(snippetSource, error.pos) : null;
  const typeLabel =
    error.expressionIndex === undefined
      ? null
      : `Type ${error.expressionIndex + 1}`;
  const detailHtml = renderErrorDetails(error, typeLabel);
  const snippetHtml = renderErrorSnippet(snippet, snippetSource, typeLabel);

  return `
<div class="error-display" role="alert">
  <div class="error-banner">
    <span class="error-icon" aria-hidden="true">!</span>
    <div class="error-banner-text">
      <div class="error-title">${escapeHtml(error.title)}</div>
      <p class="error-message">${escapeHtml(error.message)}</p>
      ${detailHtml}
    </div>
  </div>
  ${snippetHtml}
</div>`;
}

function renderErrorDetails(
  error: PositionedError,
  typeLabel: string | null,
): string {
  return [
    typeLabel === null
      ? ''
      : `<p class="error-detail">${escapeHtml(typeLabel)}</p>`,
    error.detail !== undefined && error.detail !== ''
      ? `<p class="error-detail">Type: <code>${escapeHtml(error.detail)}</code></p>`
      : '',
  ].join('');
}

function renderErrorSnippet(
  snippet: SnippetResult | null,
  snippetSource: string,
  typeLabel: string | null,
): string {
  if (snippet === null) {
    if (snippetSource === '') {
      return '';
    }
    return `
    <div class="error-snippet">
      <div class="error-snippet-label">${typeLabel === null ? 'Input' : escapeHtml(typeLabel)}</div>
      <pre class="error-source-plain">${escapeHtml(snippetSource)}</pre>
    </div>`;
  }
  const location =
    typeLabel === null
      ? snippet.locationLabel
      : `${typeLabel} — ${snippet.locationLabel}`;
  return `
    <div class="error-snippet">
      <div class="error-snippet-label">In your input</div>
      <div class="error-source-wrap">
        <table class="error-source" role="presentation">
          <tbody>
            ${snippet.rows}
          </tbody>
        </table>
      </div>
      <p class="error-location">${escapeHtml(location)}</p>
    </div>`;
}

interface SnippetResult {
  readonly rows: string;
  readonly locationLabel: string;
}

function buildSnippet(source: string, pos: number): SnippetResult {
  const clampedPos = Math.min(Math.max(0, pos), source.length);
  const { line: errorLine, col: errorCol } = posToLineCol(source, clampedPos);
  // Column is 1-based for display; caret/highlight use a 0-based index.
  const caretIndex = errorCol - 1;
  const lines = source.split('\n');
  const errorLineIndex = errorLine - 1;
  const startLine = Math.max(0, errorLineIndex - 1);
  const endLine = Math.min(lines.length - 1, errorLineIndex + 1);

  const rows: string[] = [];
  for (let i = startLine; i <= endLine; i++) {
    const lineNum = i + 1;
    const text = lines[i] ?? '';
    const isErrorLine = i === errorLineIndex;
    const lineHtml = isErrorLine
      ? renderMarkedLine(text, caretIndex)
      : escapeHtml(text);
    rows.push(`
      <tr class="error-line${isErrorLine ? ' error-line--active' : ''}">
        <td class="error-gutter">${lineNum}</td>
        <td class="error-code"><pre>${lineHtml}</pre></td>
      </tr>`);
    if (isErrorLine) {
      rows.push(`
      <tr class="error-caret-row">
        <td class="error-gutter"></td>
        <td class="error-code"><pre class="error-caret">${renderCaret(caretIndex)}</pre></td>
      </tr>`);
    }
  }

  const locationLabel =
    lines.length === 1
      ? `Position ${clampedPos + 1} (column ${errorCol})`
      : `Line ${errorLine}, column ${errorCol} (position ${clampedPos + 1})`;

  return { rows: rows.join(''), locationLabel };
}

/** Highlight the character at 0-based {@link errorIndex} on the line. */
function renderMarkedLine(line: string, errorIndex: number): string {
  const idx = Math.min(Math.max(0, errorIndex), line.length);
  const before = line.slice(0, idx);
  const at = line[idx] ?? '';
  const after = line.slice(idx + (at ? 1 : 0));
  if (!at && idx === line.length) {
    return `${escapeHtml(line)}<span class="error-cursor-marker"> </span>`;
  }
  return `${escapeHtml(before)}<span class="error-char">${escapeHtml(at)}</span>${escapeHtml(after)}`;
}

/** Place `^` under 0-based {@link errorIndex}. */
function renderCaret(errorIndex: number): string {
  const spaces = errorIndex > 0 ? ' '.repeat(errorIndex) : '';
  return `${spaces}^`;
}

function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}
