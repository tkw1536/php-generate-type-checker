import { GenerationError } from '../generator/errors.ts';
import { LexerError } from '../parser/lexer.ts';
import { ParseError } from '../parser/parser.ts';
import { PhpstanTypeExtractError } from '../parser/phpstanTypeDocblock.ts';
import { TypeAliasResolveError } from '../parser/resolveTypeAliases.ts';

export interface PositionedError {
  readonly kind: 'parse' | 'lexer' | 'generation' | 'unknown';
  readonly title: string;
  readonly message: string;
  readonly pos?: number;
  readonly detail?: string;
  readonly expressionIndex?: number;
  readonly segmentSource?: string;
}

export function describeError(err: unknown): PositionedError {
  if (err instanceof ParseError) {
    return {
      kind: 'parse',
      title: 'Parse error',
      message: err.message,
      pos: err.pos,
      expressionIndex: err.expressionIndex,
    };
  }
  if (err instanceof PhpstanTypeExtractError) {
    return {
      kind: 'parse',
      title: 'Docblock extract error',
      message: err.message,
      pos: err.pos,
    };
  }
  if (err instanceof TypeAliasResolveError) {
    return {
      kind: 'parse',
      title: 'Alias resolve error',
      message: err.message,
      detail: err.aliasName,
    };
  }
  if (err instanceof LexerError) {
    return {
      kind: 'lexer',
      title: 'Lexer error',
      message: err.message,
      pos: err.pos,
    };
  }
  if (err instanceof GenerationError) {
    return {
      kind: 'generation',
      title: 'Generation error',
      message: err.message,
      detail: err.typeDescription,
      expressionIndex: err.expressionIndex,
      segmentSource: err.segmentSource,
    };
  }
  if (err instanceof Error) {
    return {
      kind: 'unknown',
      title: 'Error',
      message: err.message,
    };
  }
  return {
    kind: 'unknown',
    title: 'Error',
    message: String(err),
  };
}

export function renderErrorHtml(error: PositionedError, sourceText: string): string {
  const snippetSource = error.segmentSource ?? sourceText;
  const hasPosition =
    error.pos !== undefined && error.pos >= 0 && snippetSource.length > 0;
  const snippet = hasPosition ? buildSnippet(snippetSource, error.pos) : null;

  const typeLabel =
    error.expressionIndex === undefined
      ? null
      : `Type ${error.expressionIndex + 1}`;

  const detailHtml = [
    typeLabel === null
      ? ''
      : `<p class="error-detail">${escapeHtml(typeLabel)}</p>`,
    error.detail
      ? `<p class="error-detail">Type: <code>${escapeHtml(error.detail)}</code></p>`
      : '',
  ].join('');

  const snippetHtml = snippet
    ? `
    <div class="error-snippet">
      <div class="error-snippet-label">In your input</div>
      <div class="error-source-wrap">
        <table class="error-source" role="presentation">
          <tbody>
            ${snippet.rows}
          </tbody>
        </table>
      </div>
      <p class="error-location">${escapeHtml(typeLabel === null ? snippet.locationLabel : `${typeLabel} — ${snippet.locationLabel}`)}</p>
    </div>`
    : snippetSource
      ? `
    <div class="error-snippet">
      <div class="error-snippet-label">${typeLabel === null ? 'Input' : escapeHtml(typeLabel)}</div>
      <pre class="error-source-plain">${escapeHtml(snippetSource)}</pre>
    </div>`
      : '';

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

interface SnippetResult {
  rows: string;
  locationLabel: string;
}

function buildSnippet(source: string, pos: number): SnippetResult {
  const clampedPos = Math.min(Math.max(0, pos), source.length);
  const { line: errorLine, col: errorCol } = posToLineCol(source, clampedPos);
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
      ? renderMarkedLine(text, errorCol)
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
        <td class="error-code"><pre class="error-caret">${renderCaret(errorCol)}</pre></td>
      </tr>`);
    }
  }

  const locationLabel =
    lines.length === 1
      ? `Position ${clampedPos + 1} (column ${errorCol})`
      : `Line ${errorLine}, column ${errorCol} (position ${clampedPos + 1})`;

  return { rows: rows.join(''), locationLabel };
}

function posToLineCol(source: string, pos: number): { line: number; col: number } {
  let line = 1;
  let col = 1;
  for (let i = 0; i < pos && i < source.length; i++) {
    if (source[i] === '\n') {
      line++;
      col = 1;
    } else {
      col++;
    }
  }
  return { line, col };
}

function renderMarkedLine(line: string, errorCol: number): string {
  const col = Math.min(errorCol, line.length);
  const before = line.slice(0, col);
  const at = line[col] ?? '';
  const after = line.slice(col + (at ? 1 : 0));
  if (!at && col === line.length) {
    return `${escapeHtml(line)}<span class="error-cursor-marker"> </span>`;
  }
  return `${escapeHtml(before)}<span class="error-char">${escapeHtml(at)}</span>${escapeHtml(after)}`;
}

function renderCaret(col: number): string {
  const spaces = col > 0 ? ' '.repeat(col) : '';
  return `${spaces}^`;
}

function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}
