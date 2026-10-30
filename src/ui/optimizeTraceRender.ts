import { optimizeTraceRuleInfo } from '../generator/optimizer/trace/rules.ts';
import type {
  TraceStep,
  TraceStepReason,
} from '../generator/optimizer/trace/types.ts';
import { highlightCode } from '../highlight.ts';
import { renderTraceRuleHelp } from './metricsHelp.ts';
import { renderEvidenceBlocks } from './optimizeTraceDetailBlocks.ts';
import {
  isEnvTraceRule,
  isProofRelationRule,
} from './optimizeTraceEnvDetail.ts';
import { programGroupLabel } from './optimizeTraceList.ts';
import { renderProofCompareView } from './optimizeTraceProofDetail.ts';
import { type PhpDiffLine, type PhpDiffResult } from './phpDiff.ts';

export type TraceDetailView = 'before' | 'after' | 'diff';

export type TraceViewTabLabels = {
  readonly before: string;
  readonly after: string;
  readonly diff: string;
};

export const REWRITE_TAB_LABELS: TraceViewTabLabels = {
  before: 'Before',
  after: 'After',
  diff: 'Diff',
};

function rewriteKindLabel(reason: TraceStepReason): string {
  if (isEnvTraceRule(reason.rule)) {
    return 'Facts';
  }
  if (isProofRelationRule(reason.rule)) {
    return 'Proof';
  }
  switch (reason.focus.before.kind) {
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

export function renderPhpPreview(php: string, ariaLabel: string): HTMLElement {
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
    const empty = renderPhpPreview(phpWhenEmpty, 'Checker PHP (no textual diff)');
    empty.classList.add('optimize-trace-diff');
    return empty;
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

export function renderDetailHeader(
  step: TraceStep,
  reason: TraceStepReason,
  topLevel: boolean,
): HTMLElement {
  const info = optimizeTraceRuleInfo(reason.rule);
  const wrap = document.createElement('div');

  const meta = document.createElement('div');
  meta.className = 'optimize-trace-meta';
  const nest = topLevel ? '' : ' · nested';
  meta.textContent = `${programGroupLabel(step.program)} · IR round ${step.outerLoop} · block ${step.blockLoop} · ${rewriteKindLabel(reason)}${nest}`;

  const titleRow = document.createElement('div');
  titleRow.className = 'optimize-trace-title';
  const title = document.createElement('span');
  title.className = 'optimize-trace-title-text';
  title.textContent = info.title;
  const helpWrap = document.createElement('span');
  helpWrap.className = 'optimize-trace-help';
  helpWrap.innerHTML = renderTraceRuleHelp(
    `optimize-trace-help-${step.index}-${reason.rule}`,
    info.title,
    info.help,
  );
  const ruleId = document.createElement('span');
  ruleId.className = 'optimize-trace-rule-id';
  ruleId.textContent = reason.rule;
  titleRow.append(title, helpWrap, ruleId);

  wrap.append(meta, titleRow);
  if (reason.rule !== 'trace.initial' && !isEnvTraceRule(reason.rule)) {
    appendOptional(wrap, renderEvidenceBlocks(step, reason));
  }
  return wrap;
}

export function renderViewTabs(
  active: TraceDetailView,
  onSelect: (view: TraceDetailView) => void,
  ariaLabel = 'Checker PHP view',
  tabLabels: TraceViewTabLabels = REWRITE_TAB_LABELS,
): HTMLElement {
  const tabs = document.createElement('div');
  tabs.className = 'optimize-trace-view-tabs';
  tabs.setAttribute('role', 'tablist');
  tabs.setAttribute('aria-label', ariaLabel);

  const views: readonly {
    readonly id: TraceDetailView;
    readonly label: string;
  }[] = [
    { id: 'before', label: tabLabels.before },
    { id: 'after', label: tabLabels.after },
    { id: 'diff', label: tabLabels.diff },
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

/** Copy text for proof-relation Compare (no unified-diff chrome). */
export function copyTextForProofRelationView(
  view: TraceDetailView,
  premisePhp: string,
  conclusionPhp: string,
): string {
  switch (view) {
    case 'before':
      return premisePhp;
    case 'after':
      return conclusionPhp;
    case 'diff':
      return `Premise:\n${premisePhp}\n\nConclusion:\n${conclusionPhp}`;
    default:
      throw new Error('never reached');
  }
}

export function renderViewBody(
  view: TraceDetailView,
  beforePhp: string,
  afterPhp: string,
  diff: PhpDiffResult,
  labels: {
    readonly before: string;
    readonly after: string;
  },
): HTMLElement {
  switch (view) {
    case 'before':
      return renderPhpPreview(beforePhp, labels.before);
    case 'after':
      return renderPhpPreview(afterPhp, labels.after);
    case 'diff':
      return renderDiffView(diff, afterPhp);
    default:
      throw new Error('never reached');
  }
}

export function renderProofRelationViewBody(
  view: TraceDetailView,
  premisePhp: string,
  conclusionPhp: string,
): HTMLElement {
  switch (view) {
    case 'before':
      return renderPhpPreview(premisePhp, 'Premise PHP');
    case 'after':
      return renderPhpPreview(conclusionPhp, 'Conclusion PHP');
    case 'diff':
      return renderProofCompareView(premisePhp, conclusionPhp);
    default:
      throw new Error('never reached');
  }
}
