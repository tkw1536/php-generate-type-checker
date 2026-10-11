import { describe, expect, it } from 'vitest';
import type { OptimizerStats } from '../generator/optimizer/stats/types.ts';
import { renderOptimizeDiagram } from './optimizeDiagram.ts';
import { optimizePassCopyText } from './optimizeDiagramPasses.ts';

const SAMPLE_STATS: OptimizerStats = {
  passes: {
    inline: { calls: 10, changed: 2 },
    dedupe: { calls: 10, changed: 1 },
    unnest: { calls: 10, changed: 0 },
    combine: { calls: 10, changed: 3 },
    flatten: { calls: 10, changed: 1 },
    facts: { calls: 10, changed: 4 },
    simplify: { calls: 10, changed: 5 },
    dce: { calls: 10, changed: 2 },
    prune: { calls: 1, changed: 0 },
  },
  simplify: {
    calls: 10,
    changed: 5,
    maxPasses: 2,
    sumPasses: 7,
  },
  outerOptimizeLoops: 2,
  blockOptimizeLoops: 15,
};

function diagramListsPassesInOrder(): void {
  const html = renderOptimizeDiagram(SAMPLE_STATS);
  expect(html).toContain('optimize-diagram');
  expect(html).toContain('optimize-diagram-svg');
  expect(html).toContain('optimize-diagram-edge');
  expect(html).toContain('optimize-diagram-diamond-shape');
  expect(html).toContain('data-decision="inner"');
  expect(html).toContain('data-decision="outer"');
  expect(html).toContain('optimize-diagram-yes-loop');
  expect(html).toContain('Yes × 2');
  expect(html).toContain('Yes × 15');
  expect(html).toContain('data-pass="inline"');
  expect(html).toContain('data-pass="flatten"');
  expect(html).toContain('data-pass="facts"');
  expect(html).toContain('data-pass="simplify"');
  expect(html).toContain('data-pass="dce"');
  expect(html).toContain('data-pass="prune"');
  expect(html).toContain('2 changed');
  expect(html).toContain('5 changed · max 2 · sum 7');
  expect(html).toContain('metrics-help');
  expect(html).toContain('help-pass-inline');
  expect(html).toContain('help-pass-inner-decision');
  expect(html).toContain('help-pass-outer-decision');
  expect(html).not.toContain('10 calls');

  const inlineAt = html.indexOf('data-pass="inline"');
  const flattenAt = html.indexOf('data-pass="flatten"');
  const factsAt = html.indexOf('data-pass="facts"');
  const dceAt = html.indexOf('data-pass="dce"');
  const innerDecAt = html.indexOf('data-decision="inner"');
  const outerDecAt = html.indexOf('data-decision="outer"');
  const pruneAt = html.indexOf('data-pass="prune"');
  expect(inlineAt).toBeGreaterThan(-1);
  expect(flattenAt).toBeGreaterThan(inlineAt);
  expect(dceAt).toBeGreaterThan(-1);
  expect(factsAt).toBeGreaterThan(dceAt);
  expect(innerDecAt).toBeGreaterThan(-1);
  expect(outerDecAt).toBeGreaterThan(-1);
  expect(pruneAt).toBeGreaterThan(-1);
}

function copyTextIncludesPassRows(): void {
  const text = optimizePassCopyText(SAMPLE_STATS);
  expect(text).toContain('IR rounds\t2');
  expect(text).toContain('Block rounds\t15');
  expect(text).toContain('Inline helpers\t2');
  expect(text).toContain('Prune unused helpers\t0');
  expect(text).toContain('Simplify — max passes\t2');
}

describe('optimizeDiagram', () => {
  it('renders sketch layout with inner/outer decisions', diagramListsPassesInOrder);
  it('formats pass copy text', copyTextIncludesPassRows);
});
