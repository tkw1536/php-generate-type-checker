import { describe, expect, it } from 'vitest';
import type { OptimizerStats } from '../generator/optimizer/stats/types.ts';
import {
  metricsReportCopyText,
  renderMetricsReport,
} from './irMetrics.ts';
import type { StageTimings } from './stageTimings.ts';

const SAMPLE_STATS: OptimizerStats = {
  passes: {
    inline: { calls: 12, changed: 2 },
    dedupe: { calls: 12, changed: 1 },
    unnest: { calls: 12, changed: 0 },
    combine: { calls: 12, changed: 1 },
    flatten: { calls: 12, changed: 1 },
    facts: { calls: 12, changed: 3 },
    simplify: { calls: 12, changed: 8 },
    dce: { calls: 12, changed: 2 },
    prune: { calls: 1, changed: 0 },
  },
  simplify: {
    calls: 12,
    changed: 8,
    maxPasses: 1,
    sumPasses: 8,
  },
  outerOptimizeLoops: 2,
  blockOptimizeLoops: 15,
};

const SAMPLE_TIMINGS: StageTimings = {
  parseMs: 0.4,
  generateMs: 1.25,
  optimizeMs: 3.5,
  renderMs: 0.8,
  optimizeRan: true,
};

const SKIPPED_OPTIMIZE_TIMINGS: StageTimings = {
  parseMs: 0.4,
  generateMs: 1.25,
  optimizeMs: 0,
  renderMs: 0.8,
  optimizeRan: false,
};

function reportIncludesStagesAndOptimizer(): void {
  const html = renderMetricsReport(SAMPLE_TIMINGS, SAMPLE_STATS);
  expect(html).toContain('metrics-pipeline');
  expect(html).toContain('metrics-stages-header');
  expect(html).toContain('optimize-diagram');
  expect(html).toContain('optimize-diagram-svg');
  expect(html).toContain('data-decision="outer"');
  expect(html).toContain('data-decision="inner"');
  expect(html).toContain('data-pass="inline"');
  expect(html).toContain('data-stage="parse"');
  expect(html).toContain('help-stage-parse');
  expect(html).toContain('help-pass-simplify');
  expect(html).toContain('1.25 ms');
  expect(html).not.toContain('ir-metrics-table');
  const optimizeAt = html.indexOf('data-stage="optimize"');
  const outerAt = html.indexOf('data-decision="outer"');
  const inlineAt = html.indexOf('data-pass="inline"');
  const factsAt = html.indexOf('data-pass="facts"');
  expect(optimizeAt).toBeGreaterThan(-1);
  expect(outerAt).toBeGreaterThan(optimizeAt);
  expect(inlineAt).toBeGreaterThan(optimizeAt);
  expect(factsAt).toBeGreaterThan(inlineAt);
}

function reportShowsOptimizeSkipped(): void {
  const html = renderMetricsReport(SKIPPED_OPTIMIZE_TIMINGS, null);
  expect(html).toContain('stages-diagram-box--skipped');
  expect(html).toContain('skipped');
  expect(html).not.toContain('Optimizer skipped');
  expect(html).not.toContain('ir-metrics-table');
  expect(html).not.toContain('optimize-diagram');
}

function reportCopyIncludesStagesThenOptimizer(): void {
  const text = metricsReportCopyText(SAMPLE_TIMINGS, SAMPLE_STATS);
  expect(text).toContain('Parse\t');
  expect(text).toContain('Optimize\t');
  expect(text).toContain('Inline helpers\t2');
  expect(text).toContain('Block rounds\t15');
  expect(text).toContain('Simplify — max passes\t1');
}

describe('irMetrics', () => {
  it('renders stages diagram above optimizer diagram', reportIncludesStagesAndOptimizer);
  it('shows optimize skipped stage without optimizer note', reportShowsOptimizeSkipped);
  it('copies stage timings then optimizer TSV', reportCopyIncludesStagesThenOptimizer);
});
