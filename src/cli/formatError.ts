import {
  describeError,
  posToLineCol,
  type PositionedError,
} from '../describeError.ts';

/**
 * Format an error for STDERR the way the UI shows location (title, message, snippet + caret).
 */
export function formatCliError(err: unknown, sourceText: string): string {
  const error = describeError(err);
  const snippetSource = error.segmentSource ?? sourceText;
  const lines: string[] = [`${error.title}: ${error.message}`];

  if (error.expressionIndex !== undefined) {
    lines.push(`Type ${error.expressionIndex + 1}`);
  }
  if (error.detail !== undefined && error.detail !== '') {
    lines.push(`Type: ${error.detail}`);
  }

  const snippet = formatSnippet(error, snippetSource);
  if (snippet !== '') {
    lines.push('', snippet);
  }
  return `${lines.join('\n')}\n`;
}

/** Plain-text analogue of the UI error snippet (context lines + `^` caret). */
function formatSnippet(error: PositionedError, source: string): string {
  if (source === '') {
    return '';
  }

  const pos = error.pos;
  if (pos === undefined || pos < 0) {
    return `Input:\n${source}`;
  }

  const clampedPos = Math.min(Math.max(0, pos), source.length);
  const { line: errorLine, col: errorCol } = posToLineCol(source, clampedPos);
  const caretIndex = errorCol - 1;
  const sourceLines = source.split('\n');
  const errorLineIndex = errorLine - 1;
  const startLine = Math.max(0, errorLineIndex - 1);
  const endLine = Math.min(sourceLines.length - 1, errorLineIndex + 1);

  const out: string[] = ['In your input:'];
  const gutterWidth = String(endLine + 1).length;

  for (let i = startLine; i <= endLine; i++) {
    const lineNum = String(i + 1).padStart(gutterWidth, ' ');
    const text = sourceLines[i] ?? '';
    out.push(`${lineNum} | ${text}`);
    if (i === errorLineIndex) {
      const pad = ' '.repeat(gutterWidth);
      const spaces = caretIndex > 0 ? ' '.repeat(caretIndex) : '';
      out.push(`${pad} | ${spaces}^`);
    }
  }

  const locationLabel =
    sourceLines.length === 1
      ? `Position ${clampedPos + 1} (column ${errorCol})`
      : `Line ${errorLine}, column ${errorCol} (position ${clampedPos + 1})`;
  const typePrefix =
    error.expressionIndex === undefined
      ? ''
      : `Type ${error.expressionIndex + 1} — `;
  out.push(`${typePrefix}${locationLabel}`);
  return out.join('\n');
}
