import type { OptimizeTraceEvent } from '../generator/optimizer/trace/types.ts';
import { describeError, renderErrorHtml } from './errorDisplay.ts';
import { renderEventList } from './optimizeTraceList.ts';
import { checkerPhpForEvent } from './optimizeTracePhp.ts';
import {
  type TraceDetailView,
  copyTextForView,
  renderDetailHeader,
  renderViewBody,
  renderViewTabs,
} from './optimizeTraceRender.ts';

/** Split list + before/after/diff PHP for fine-grained optimize rewrites. */
export class OptimizeTracePanel {
  readonly tabId = 'optimize-trace' as const;
  readonly bodyEl: HTMLElement;
  rawText = '';
  private events: readonly OptimizeTraceEvent[] = [];
  private selectedIndex = 0;
  private detailView: TraceDetailView = 'diff';

  constructor(bodyEl: HTMLElement) {
    this.bodyEl = bodyEl;
  }

  setTrace(events: readonly OptimizeTraceEvent[], optimizeRan: boolean): void {
    this.bodyEl.classList.remove('panel-body--error');
    this.events = events;
    this.detailView = 'diff';
    if (!optimizeRan) {
      this.rawText = '';
      this.bodyEl.innerHTML =
        '<p class="optimize-trace-empty">Optimize is off — no rewrite trace.</p>';
      return;
    }
    if (events.length === 0) {
      this.rawText = '';
      this.bodyEl.innerHTML =
        '<p class="optimize-trace-empty">No rewrite applications for this input.</p>';
      return;
    }
    this.selectedIndex = events[0].index;
    this.render();
  }

  setError(err: unknown, sourceText: string): void {
    const described = describeError(err);
    this.rawText = described.message;
    this.events = [];
    this.bodyEl.classList.add('panel-body--error');
    this.bodyEl.innerHTML = renderErrorHtml(described, sourceText);
  }

  private render(): void {
    const selected = this.events.find((e) => e.index === this.selectedIndex);
    if (selected === undefined) {
      return;
    }

    const { beforePhp, afterPhp, diff } = checkerPhpForEvent(selected);
    this.rawText = copyTextForView(
      this.detailView,
      beforePhp,
      afterPhp,
      diff,
    );

    const root = document.createElement('div');
    root.className = 'optimize-trace';

    const list = renderEventList(this.events, this.selectedIndex, (index) => {
      this.selectedIndex = index;
      this.detailView = 'diff';
      this.render();
    });

    const detail = document.createElement('div');
    detail.className = 'optimize-trace-detail';
    detail.append(
      renderDetailHeader(selected),
      renderViewTabs(this.detailView, (view) => {
        this.detailView = view;
        this.render();
      }),
      renderViewBody(this.detailView, beforePhp, afterPhp, diff),
    );

    root.append(list, detail);
    this.bodyEl.replaceChildren(root);
  }
}
