import type { OptimizerStats } from '../generator/optimizer/statsTypes.ts';
import { describeError, renderErrorHtml } from './errorDisplay.ts';
import {
  metricsReportCopyText,
  renderMetricsReport,
} from './irMetrics.ts';
import type { StageTimings } from './stageTimings.ts';

/** HTML metrics panel (stages diagram + optimizer table; not highlight.js). */
export class IrMetricsPanel {
  readonly tabId = 'ir-metrics' as const;
  readonly bodyEl: HTMLElement;
  rawText = '';

  constructor(bodyEl: HTMLElement) {
    this.bodyEl = bodyEl;
  }

  setReport(
    timings: StageTimings,
    optimizerStats: OptimizerStats | null,
  ): void {
    this.rawText = metricsReportCopyText(timings, optimizerStats);
    this.bodyEl.classList.remove('panel-body--error');
    this.bodyEl.innerHTML = renderMetricsReport(timings, optimizerStats);
  }

  setError(err: unknown, sourceText: string): void {
    const described = describeError(err);
    this.rawText = described.message;
    this.bodyEl.classList.add('panel-body--error');
    this.bodyEl.innerHTML = renderErrorHtml(described, sourceText);
  }
}
