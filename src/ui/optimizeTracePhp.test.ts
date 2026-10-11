import { describe, expect, it } from 'vitest';
import { parseType } from '../parser/index.ts';
import { buildMany, optimize } from '../generator/pipeline.ts';
import { checkerPhpForStep } from './optimizeTracePhp.ts';

function requireRewriteStep(
  steps: ReturnType<typeof optimize>['steps'],
  program: string,
) {
  for (const step of steps) {
    if (step.program === program && step.reason.rule !== 'trace.initial') {
      return step;
    }
  }
  throw new Error(`missing rewrite step for ${program}`);
}

describe('checkerPhpForStep', () => {
  it('wraps before/after in a function header and diffs the full checker', () => {
    const ast = parseType('positive-int');
    const { ir: built } = buildMany([ast]);
    const { steps } = optimize(built);
    const step = requireRewriteStep(steps, 'isPositiveInt');
    const { beforePhp, afterPhp, diff } = checkerPhpForStep(step);
    expect(
      beforePhp.startsWith('function isPositiveInt(mixed $value): bool\n{'),
    ).toBe(true);
    expect(
      afterPhp.startsWith('function isPositiveInt(mixed $value): bool\n{'),
    ).toBe(true);
    expect(beforePhp).not.toEqual(afterPhp);
    expect(diff.hunks.length).toBeGreaterThan(0);
    expect(diff.unified).toContain('function isPositiveInt');
  });
});
