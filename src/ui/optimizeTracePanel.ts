import type { TraceStep } from '../generator/optimizer/trace/types.ts';
import { describeError, renderErrorHtml } from './errorDisplay.ts';
import {
  isCollapsedByDefault,
  isEnvTraceRule,
  renderEnvFactsPane,
} from './optimizeTraceEnvDetail.ts';
import { renderEventList } from './optimizeTraceList.ts';
import { checkerPhpForStep, focusPhpForReason } from './optimizeTracePhp.ts';
import {
  type TraceDetailView,
  copyTextForView,
  renderDetailHeader,
  renderViewBody,
  renderViewTabs,
} from './optimizeTraceRender.ts';
import {
  defaultCollapsedKeys,
  findTreeNode,
  flattenTraceTree,
  isAncestorPath,
  pathKey,
  type TracePath,
  type TraceTreeNode,
} from './optimizeTraceTree.ts';

function appendRewriteViews(
  detail: HTMLElement,
  selected: TraceTreeNode,
  detailView: TraceDetailView,
  onView: (view: TraceDetailView) => void,
): string {
  const php = selected.topLevel
    ? checkerPhpForStep(selected.step)
    : focusPhpForReason(selected.step, selected.reason);
  const tabLabel = selected.topLevel
    ? 'Checker PHP view'
    : 'Focus PHP view';
  const bodyLabels = selected.topLevel
    ? {
        before: 'Full checker PHP before rewrite',
        after: 'Full checker PHP after rewrite',
      }
    : {
        before: 'Focus PHP before rewrite',
        after: 'Focus PHP after rewrite',
      };
  detail.append(
    renderViewTabs(detailView, onView, tabLabel),
    renderViewBody(
      detailView,
      php.beforePhp,
      php.afterPhp,
      php.diff,
      bodyLabels,
    ),
  );
  return copyTextForView(detailView, php.beforePhp, php.afterPhp, php.diff);
}

function appendDetailViews(
  detail: HTMLElement,
  selected: TraceTreeNode,
  detailView: TraceDetailView,
  onView: (view: TraceDetailView) => void,
): string {
  if (isEnvTraceRule(selected.reason.rule)) {
    const pane = renderEnvFactsPane(selected.step, selected.reason);
    detail.append(pane.el);
    return pane.copyText;
  }
  return appendRewriteViews(detail, selected, detailView, onView);
}

/** Split list + before/after/diff PHP for fine-grained optimize steps. */
export class OptimizeTracePanel {
  readonly tabId = 'optimize-trace' as const;
  readonly bodyEl: HTMLElement;
  rawText = '';
  private steps: readonly TraceStep[] = [];
  private selectedPath: TracePath = [0];
  private detailView: TraceDetailView = 'diff';
  private collapsed = new Set<string>();

  constructor(bodyEl: HTMLElement) {
    this.bodyEl = bodyEl;
  }

  setTrace(steps: readonly TraceStep[], optimizeRan: boolean): void {
    this.bodyEl.classList.remove('panel-body--error');
    this.steps = steps;
    this.detailView = 'diff';
    if (!optimizeRan) {
      this.rawText = '';
      this.collapsed = new Set();
      this.bodyEl.innerHTML =
        '<p class="optimize-trace-empty">Optimize is off — no rewrite trace.</p>';
      return;
    }
    if (steps.length === 0) {
      this.rawText = '';
      this.collapsed = new Set();
      this.bodyEl.innerHTML =
        '<p class="optimize-trace-empty">No rewrite applications for this input.</p>';
      return;
    }
    const nodes = flattenTraceTree(steps);
    this.collapsed = new Set(
      defaultCollapsedKeys(nodes, isCollapsedByDefault),
    );
    this.selectedPath = [steps[0].index];
    this.render();
  }

  setError(err: unknown, sourceText: string): void {
    const described = describeError(err);
    this.rawText = described.message;
    this.steps = [];
    this.collapsed = new Set();
    this.bodyEl.classList.add('panel-body--error');
    this.bodyEl.innerHTML = renderErrorHtml(described, sourceText);
  }

  private toggleCollapsed(path: TracePath): void {
    const key = pathKey(path);
    if (this.collapsed.has(key)) {
      this.collapsed.delete(key);
    } else {
      this.collapsed.add(key);
      if (isAncestorPath(path, this.selectedPath)) {
        this.selectedPath = path;
      }
    }
    this.render();
  }

  private render(): void {
    const selected =
      findTreeNode(flattenTraceTree(this.steps), this.selectedPath) ??
      flattenTraceTree(this.steps)[0];
    if (selected === undefined) {
      return;
    }
    const root = document.createElement('div');
    root.className = 'optimize-trace';
    const detail = document.createElement('div');
    detail.className = 'optimize-trace-detail';
    detail.append(
      renderDetailHeader(selected.step, selected.reason, selected.topLevel),
    );
    this.rawText = appendDetailViews(
      detail,
      selected,
      this.detailView,
      (view) => {
        this.detailView = view;
        this.render();
      },
    );
    root.append(
      renderEventList(this.steps, selected.path, this.collapsed, {
        onSelect: (path) => {
          this.selectedPath = path;
          this.detailView = 'diff';
          this.render();
        },
        onToggle: (path) => {
          this.toggleCollapsed(path);
        },
      }),
      detail,
    );
    this.bodyEl.replaceChildren(root);
  }
}
