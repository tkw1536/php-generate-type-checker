import { describe, expect, it } from 'vitest';
import { parseType } from '../../parser/index.ts';
import { buildMany } from '../pipeline.ts';
import { optimize } from './index.ts';
import { blockHasCallChecker } from '../../../test-utils/inlineTestHelpers.ts';

describe('optimize integration', () => {
  it('inlines nested array union in foreach and prunes helpers', () => {
    const ast = parseType('array<array{x: string}|array{y: string}>');
    const { ir: built } = buildMany([ast]);
    const optimized = optimize(built);
    const entry = optimized.programs[optimized.order[0]];
    expect(blockHasCallChecker(entry.body)).toBe(false);
    expect(optimized.order.length).toBeLessThan(built.order.length);
  });

  it('inlines shape union and prunes helpers', () => {
    const ast = parseType('array{left: array{}, right: never[]}|array{}');
    const { ir: built } = buildMany([ast]);
    const optimized = optimize(built);
    const entry = optimized.programs[optimized.order[0]];
    expect(blockHasCallChecker(entry.body)).toBe(false);
    expect(optimized.order.length).toBeLessThan(built.order.length);
  });
});
