import { describe, expect, it } from 'vitest';
import {
  formatStageMs,
  renderStagesDiagram,
  renderStagesPipelineHeader,
  stageTimingsCopyText,
  stageTimingsTotalMs,
  type StageTimings,
} from './stageTimings.ts';

const TIMINGS: StageTimings = {
  parseMs: 0.4,
  generateMs: 1.25,
  optimizeMs: 3.5,
  renderMs: 0.8,
  optimizeRan: true,
};

const WIDE_TIMINGS: StageTimings = {
  parseMs: 0.4,
  generateMs: 1.25,
  optimizeMs: 150.4,
  renderMs: 0.8,
  optimizeRan: true,
};

function formatsMilliseconds(): void {
  expect(formatStageMs(0.01)).toBe('0.01 ms');
  expect(formatStageMs(1.234)).toBe('1.23 ms');
  expect(formatStageMs(12.34)).toBe('12.34 ms');
  expect(formatStageMs(150.4)).toBe('150.40 ms');
  expect(formatStageMs(0.4, 3)).toBe('000.40 ms');
}

function totalsExcludeSkippedOptimize(): void {
  expect(stageTimingsTotalMs(TIMINGS)).toBeCloseTo(5.95);
  expect(
    stageTimingsTotalMs({ ...TIMINGS, optimizeRan: false, optimizeMs: 99 }),
  ).toBeCloseTo(2.45);
}

function diagramListsAllStages(): void {
  const html = renderStagesDiagram(TIMINGS);
  expect(html).toContain('Parse');
  expect(html).toContain('Generate');
  expect(html).toContain('Optimize');
  expect(html).toContain('Render');
  expect(html).toContain('3.50 ms');
  expect(html).toContain('0.40 ms');
  expect(html).toContain('stages-diagram-total');
  expect(html).toContain('Total');
  expect(html).toContain('stages-diagram-arrow-svg');
  expect(html.indexOf('data-stage="render"')).toBeLessThan(
    html.indexOf('stages-diagram-total'),
  );
  expect(html).toContain('help-stage-parse');
  expect(html).toContain('metrics-help');
}

function padsToWidestStage(): void {
  const html = renderStagesDiagram(WIDE_TIMINGS);
  expect(html).toContain('000.40 ms');
  expect(html).toContain('150.40 ms');
}

function copyTextIsTabSeparated(): void {
  const text = stageTimingsCopyText(TIMINGS);
  expect(text).toContain('Parse\t0.40 ms');
  expect(text).toContain('Optimize\t3.50 ms');
}

function pipelineHeaderSplitsAroundOptimize(): void {
  const html = renderStagesPipelineHeader(TIMINGS);
  expect(html).toContain('metrics-stages-header');
  expect(html).toContain('metrics-stages-lead');
  expect(html).toContain('metrics-stages-optimize');
  expect(html).toContain('metrics-stages-trail');
  expect(html).toContain('data-stage="optimize"');
  expect(html.indexOf('data-stage="parse"')).toBeLessThan(
    html.indexOf('data-stage="optimize"'),
  );
  expect(html.indexOf('data-stage="optimize"')).toBeLessThan(
    html.indexOf('data-stage="render"'),
  );
}

describe('stageTimings', () => {
  it('formats milliseconds', formatsMilliseconds);
  it('totals exclude skipped optimize time', totalsExcludeSkippedOptimize);
  it('renders a stages diagram', diagramListsAllStages);
  it('pads leading zeros to the widest stage', padsToWidestStage);
  it('formats copy text', copyTextIsTabSeparated);
  it('splits pipeline header around Optimize', pipelineHeaderSplitsAroundOptimize);
});
