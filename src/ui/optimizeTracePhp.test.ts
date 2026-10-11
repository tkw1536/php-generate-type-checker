import { describe, expect, it } from 'vitest';
import { parseType } from '../parser/index.ts';
import { buildMany, optimize } from '../generator/pipeline.ts';
import { checkerPhpForEvent } from './optimizeTracePhp.ts';

function requireRewriteEvent(
  trace: ReturnType<typeof optimize>['trace'],
  program: string,
) {
  for (const event of trace) {
    if (event.program === program && event.rule !== 'trace.baseline') {
      return event;
    }
  }
  throw new Error(`missing rewrite event for ${program}`);
}

describe('checkerPhpForEvent', () => {
  it('wraps before/after in a function header and diffs the full checker', () => {
    const ast = parseType('positive-int');
    const { ir: built } = buildMany([ast]);
    const { trace } = optimize(built);
    const event = requireRewriteEvent(trace, 'isPositiveInt');
    const { beforePhp, afterPhp, diff } = checkerPhpForEvent(event);
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
