import { optimizeTraceRuleInfo } from '../generator/optimizer/trace/rules.ts';
import type { OptimizeTraceEvent } from '../generator/optimizer/trace/types.ts';
import { highlightCode } from '../highlight.ts';
import { renderTraceRuleHelp } from './metricsHelp.ts';
import {
  renderAbsorbBlocks,
  renderFactsBlock,
  renderNestedBlock,
} from './optimizeTraceDetailBlocks.ts';
import { wrapTraceFold } from './optimizeTraceFold.ts';
import { programGroupLabel } from './optimizeTraceList.ts';
import {
  eventTempNames,
  renderEventSnapshot,
} from './optimizeTraceRenderPhp.ts';
import { type PhpDiffLine, type PhpDiffResult } from './phpDiff.ts';

export type TraceDetailView = 'before' | 'after' | 'diff';

function focusPhp(event: OptimizeTraceEvent): {
  readonly before: string;
  readonly after: string;
} {
  const temps = eventTempNames(event);
  return {
    before: renderEventSnapshot(event.focus.before, temps).replaceAll('\n', ' '),
    after: renderEventSnapshot(event.focus.after, temps).replaceAll('\n', ' '),
  };
}
function appendMetaLine(parent: HTMLElement, label: string, body: string): void {
  const line = document.createElement('div');
  line.className = 'optimize-trace-meta-line';
  const labelEl = document.createElement('span');
  labelEl.className = 'optimize-trace-meta-label';
  labelEl.textContent = label;
  const bodyEl = document.createElement('span');
  bodyEl.className = 'optimize-trace-meta-body';
  bodyEl.textContent = body;
  line.append(labelEl, bodyEl);
  parent.append(line);
}

function rewriteKindLabel(event: OptimizeTraceEvent): string {
  switch (event.focus.before.kind) {
    case 'expr':
      return 'Expression';
    case 'block':
      return 'Block';
    case 'ir':
      return 'IR';
    default:
      throw new Error('never reached');
  }
}

function modifiedFocusTitle(event: OptimizeTraceEvent): string {
  switch (event.focus.before.kind) {
    case 'expr':
      return 'Modified Expression';
    case 'block':
      return 'Modified Block';
    case 'ir':
      return 'Modified IR';
    default:
      throw new Error('never reached');
  }
}

function renderFocusBlock(event: OptimizeTraceEvent): HTMLElement {
  const { before, after } = focusPhp(event);
  return wrapTraceFold(
    modifiedFocusTitle(event),
    null,
    'optimize-trace-focus',
    (body) => {
      appendMetaLine(body, 'Before', before);
      if (before !== after) {
        appendMetaLine(body, 'After', after);
      }
    },
  );
}

function renderDetailNote(event: OptimizeTraceEvent): HTMLElement | null {
  switch (event.detail.kind) {
    case 'none':
    case 'facts':
    case 'absorb':
    case 'nested':
      return null;
    case 'inline': {
      const callee = event.detail.callee;
      return wrapTraceFold('Inline', 1, 'optimize-trace-focus', (body) => {
        appendMetaLine(body, 'Inline', callee);
      });
    }
    case 'prune': {
      const removed = event.detail.removed;
      return wrapTraceFold('Removed', 1, 'optimize-trace-focus', (body) => {
        appendMetaLine(body, 'Removed', removed);
      });
    }
    default:
      throw new Error('never reached');
  }
}

function gutter(kind: PhpDiffLine['kind']): string {
  switch (kind) {
    case 'add':
      return '+';
    case 'del':
      return '-';
    case 'ctx':
      return ' ';
    default:
      throw new Error('never reached');
  }
}

function renderDiffLine(line: PhpDiffLine): HTMLElement {
  const row = document.createElement('div');
  row.className = `optimize-trace-diff-line optimize-trace-diff-line--${line.kind}`;
  const mark = document.createElement('span');
  mark.className = 'optimize-trace-diff-gutter';
  mark.textContent = gutter(line.kind);
  const code = document.createElement('code');
  code.className = 'hljs language-php';
  code.innerHTML = highlightCode(line.text === '' ? ' ' : line.text, 'php');
  row.append(mark, code);
  return row;
}

function renderPhpPreview(php: string, ariaLabel: string): HTMLElement {
  const preview = document.createElement('pre');
  preview.className = 'output-pre optimize-trace-pane';
  preview.setAttribute('aria-label', ariaLabel);
  const code = document.createElement('code');
  code.className = 'hljs language-php';
  code.innerHTML = highlightCode(php, 'php');
  preview.append(code);
  return preview;
}

function renderDiffView(diff: PhpDiffResult, phpWhenEmpty: string): HTMLElement {
  if (diff.hunks.length === 0) {
    return renderPhpPreview(phpWhenEmpty, 'Checker PHP (no textual diff)');
  }

  const diffEl = document.createElement('div');
  diffEl.className = 'optimize-trace-pane optimize-trace-diff';
  diffEl.setAttribute('aria-label', 'Unified PHP diff of full checker');

  for (const hunk of diff.hunks) {
    const header = document.createElement('div');
    header.className = 'optimize-trace-diff-hunk-header';
    header.textContent = `@@ -${hunk.oldStart},${hunk.oldCount} +${hunk.newStart},${hunk.newCount} @@`;
    diffEl.append(header);
    for (const line of hunk.lines) {
      diffEl.append(renderDiffLine(line));
    }
  }
  return diffEl;
}

function appendOptional(parent: HTMLElement, child: HTMLElement | null): void {
  if (child !== null) {
    parent.append(child);
  }
}

function appendRewriteDetails(
  wrap: HTMLElement,
  selected: OptimizeTraceEvent,
): void {
  wrap.append(renderFocusBlock(selected));
  appendOptional(wrap, renderFactsBlock(selected));
  appendOptional(wrap, renderAbsorbBlocks(selected));
  appendOptional(wrap, renderNestedBlock(selected));
  appendOptional(wrap, renderDetailNote(selected));
}

export function renderDetailHeader(selected: OptimizeTraceEvent): HTMLElement {
  const info = optimizeTraceRuleInfo(selected.rule);
  const wrap = document.createElement('div');

  const meta = document.createElement('div');
  meta.className = 'optimize-trace-meta';
  meta.textContent = `${programGroupLabel(selected.program)} · IR round ${selected.outerLoop} · block ${selected.blockLoop} · ${rewriteKindLabel(selected)}`;

  const titleRow = document.createElement('div');
  titleRow.className = 'optimize-trace-title';
  const title = document.createElement('span');
  title.className = 'optimize-trace-title-text';
  title.textContent = info.title;
  const helpWrap = document.createElement('span');
  helpWrap.className = 'optimize-trace-help';
  helpWrap.innerHTML = renderTraceRuleHelp(
    `optimize-trace-help-${selected.index}`,
    info.title,
    info.help,
  );
  const ruleId = document.createElement('span');
  ruleId.className = 'optimize-trace-rule-id';
  ruleId.textContent = selected.rule;
  titleRow.append(title, helpWrap, ruleId);

  wrap.append(meta, titleRow);
  if (selected.rule !== 'trace.baseline') {
    appendRewriteDetails(wrap, selected);
  }
  return wrap;
}

export function renderViewTabs(
  active: TraceDetailView,
  onSelect: (view: TraceDetailView) => void,
): HTMLElement {
  const tabs = document.createElement('div');
  tabs.className = 'optimize-trace-view-tabs';
  tabs.setAttribute('role', 'tablist');
  tabs.setAttribute('aria-label', 'Checker PHP view');

  const views: readonly {
    readonly id: TraceDetailView;
    readonly label: string;
  }[] = [
    { id: 'before', label: 'Before' },
    { id: 'after', label: 'After' },
    { id: 'diff', label: 'Diff' },
  ];
  for (const view of views) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'optimize-trace-view-tab';
    btn.setAttribute('role', 'tab');
    btn.setAttribute('aria-selected', view.id === active ? 'true' : 'false');
    btn.classList.toggle('active', view.id === active);
    btn.textContent = view.label;
    btn.addEventListener('click', () => {
      onSelect(view.id);
    });
    tabs.append(btn);
  }
  return tabs;
}

export function copyTextForView(
  view: TraceDetailView,
  beforePhp: string,
  afterPhp: string,
  diff: PhpDiffResult,
): string {
  switch (view) {
    case 'before':
      return beforePhp;
    case 'after':
      return afterPhp;
    case 'diff':
      return diff.unified === '' ? afterPhp : diff.unified;
    default:
      throw new Error('never reached');
  }
}

export function renderViewBody(
  view: TraceDetailView,
  beforePhp: string,
  afterPhp: string,
  diff: PhpDiffResult,
): HTMLElement {
  switch (view) {
    case 'before':
      return renderPhpPreview(beforePhp, 'Full checker PHP before rewrite');
    case 'after':
      return renderPhpPreview(afterPhp, 'Full checker PHP after rewrite');
    case 'diff':
      return renderDiffView(diff, afterPhp);
    default:
      throw new Error('never reached');
  }
}
