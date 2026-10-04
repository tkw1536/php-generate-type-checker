import type { OptimizerStats } from '../generator/optimizer/statsTypes.ts';
import { renderOptimizeDiagram } from './optimizeDiagram.ts';
import { optimizePassCopyText } from './optimizeDiagramPasses.ts';
import {
  renderStagesPipelineHeader,
  stageTimingsCopyText,
  type StageTimings,
} from './stageTimings.ts';

export function renderMetricsReport(
  timings: StageTimings,
  optimizerStats: OptimizerStats | null,
): string {
  const optimizerSection =
    optimizerStats === null ? '' : renderOptimizeDiagram(optimizerStats);

  return `<div class="ir-metrics">
  <div class="metrics-pipeline">
    ${renderStagesPipelineHeader(timings)}
    ${optimizerSection}
  </div>
</div>`;
}

export function metricsReportCopyText(
  timings: StageTimings,
  optimizerStats: OptimizerStats | null,
): string {
  const stageText = stageTimingsCopyText(timings);
  if (optimizerStats === null) {
    return stageText;
  }
  return `${stageText}\n\n${optimizePassCopyText(optimizerStats)}`;
}
