import { describe, expect, it } from 'vitest';
import { parseType } from '../../parser/index.ts';
import { buildMany } from '../pipeline.ts';
import { optimizeWithStats } from './index.ts';

describe('optimizeWithStats', () => {
  it('reports non-negative simplify stats for nested arrays', () => {
    const ast = parseType('array<array<string>>');
    const { ir: built } = buildMany([ast]);
    const { ir, stats } = optimizeWithStats(built);
    expect(ir.order.length).toBeGreaterThan(0);
    expect(stats.simplify.calls).toBeGreaterThan(0);
    expect(stats.simplify.changed).toBeGreaterThanOrEqual(0);
    expect(stats.simplify.maxPasses).toBeLessThanOrEqual(stats.simplify.sumPasses);
    expect(stats.outerOptimizeLoops).toBeGreaterThanOrEqual(1);
    expect(stats.blockOptimizeLoops).toBeGreaterThanOrEqual(0);
    expect(stats.passes.inline.calls).toBeGreaterThan(0);
    expect(stats.passes.dedupe.calls).toBe(stats.passes.inline.calls);
    expect(stats.passes.simplify.calls).toBe(stats.simplify.calls);
    expect(stats.passes.simplify.changed).toBe(stats.simplify.changed);
    expect(stats.passes.prune.calls).toBe(1);
  });

  it('reports non-negative simplify stats for keyed arrays', () => {
    const ast = parseType('array<string, int>');
    const { ir: built } = buildMany([ast]);
    const { stats } = optimizeWithStats(built);
    expect(stats.simplify.calls).toBeGreaterThan(0);
    expect(stats.outerOptimizeLoops).toBeGreaterThanOrEqual(1);
    expect(stats.blockOptimizeLoops).toBeGreaterThanOrEqual(0);
    expect(stats.passes.dce.calls).toBeGreaterThan(0);
    expect(stats.passes.prune.calls).toBe(1);
  });
});
