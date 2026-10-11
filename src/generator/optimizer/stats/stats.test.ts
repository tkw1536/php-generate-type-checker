import { describe, expect, it } from 'vitest';
import { parseType } from '../../../parser/index.ts';
import { buildMany } from '../../pipeline.ts';
import { optimize } from '../index.ts';

describe('optimize', () => {
  it('reports non-negative simplify stats for nested arrays', () => {
    const ast = parseType('array<array<string>>');
    const { ir: built } = buildMany([ast]);
    const { ir, stats } = optimize(built);
    expect(ir.order.length).toBeGreaterThan(0);
    expect(stats.simplify.calls).toBeGreaterThan(0);
    expect(stats.simplify.changed).toBeGreaterThanOrEqual(0);
    expect(stats.simplify.maxPasses).toBeLessThanOrEqual(stats.simplify.sumPasses);
    expect(stats.outerOptimizeLoops).toBeGreaterThanOrEqual(1);
    expect(stats.blockOptimizeLoops).toBeGreaterThanOrEqual(0);
    expect(stats.outerFixpointCapped).toBe(false);
    expect(stats.blockFixpointCapped).toBe(false);
    expect(stats.simplifyFixpointCapped).toBe(false);
    expect(stats.exprNormalizeCapped).toBe(false);
    expect(stats.passes.inline.calls).toBeGreaterThan(0);
    expect(stats.passes.dedupe.calls).toBe(stats.passes.inline.calls);
    expect(stats.passes.simplify.calls).toBe(stats.simplify.calls);
    expect(stats.passes.simplify.changed).toBe(stats.simplify.changed);
    expect(stats.passes.prune.calls).toBe(1);
  });

  it('reports non-negative simplify stats for keyed arrays', () => {
    const ast = parseType('array<string, int>');
    const { ir: built } = buildMany([ast]);
    const { stats } = optimize(built);
    expect(stats.simplify.calls).toBeGreaterThan(0);
    expect(stats.outerOptimizeLoops).toBeGreaterThanOrEqual(1);
    expect(stats.blockOptimizeLoops).toBeGreaterThanOrEqual(0);
    expect(stats.outerFixpointCapped).toBe(false);
    expect(stats.blockFixpointCapped).toBe(false);
    expect(stats.simplifyFixpointCapped).toBe(false);
    expect(stats.exprNormalizeCapped).toBe(false);
    expect(stats.passes.dce.calls).toBeGreaterThan(0);
    expect(stats.passes.prune.calls).toBe(1);
  });

  it('converges without expand/absorb ping-pong on positive-int', () => {
    const ast = parseType('positive-int');
    const { ir: built } = buildMany([ast]);
    const { stats } = optimize(built);
    expect(stats.outerFixpointCapped).toBe(false);
    expect(stats.blockFixpointCapped).toBe(false);
    expect(stats.simplifyFixpointCapped).toBe(false);
    expect(stats.exprNormalizeCapped).toBe(false);
  });
});
