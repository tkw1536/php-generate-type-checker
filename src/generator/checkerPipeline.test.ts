import { describe, expect, it } from 'vitest';
import { parseType } from '../parser/index.ts';
import type { CheckerStmt } from './checkerIR.ts';
import { buildCheckerPipeline } from './checkerPipeline.ts';
import { emitFromPipeline } from './emit.ts';
import { normalizeNode } from './normalize.ts';

function countFailIfStatements(statements: CheckerStmt[]): number {
  let count = 0;
  for (const stmt of statements) {
    if (stmt.kind === 'failIf') {
      count++;
    }
    if (stmt.kind === 'foreach') {
      count += countFailIfStatements(stmt.body);
    }
  }
  return count;
}

describe('buildCheckerPipeline', () => {
  it('optimizes every checker function in emitOrder', () => {
    const ast = normalizeNode(parseType('array<int|array<string>>'));
    const pipeline = buildCheckerPipeline(ast, {
      nameFunctionsByType: true,
    });
    expect(pipeline.built.order).toBe(pipeline.optimized.order);
    for (const name of pipeline.built.order) {
      expect(pipeline.built.programs[name]).toBeDefined();
      expect(pipeline.optimized.programs[name]).toBeDefined();
    }
  });

  it('applies readable emit to non-entry functions in emitOrder', () => {
    const ast = normalizeNode(parseType('array<int>|array<string>'));
    const pipeline = buildCheckerPipeline(ast, {
      nameFunctionsByType: true,
      prioritizeReadabilityOverCompactness: true,
    });
    expect(pipeline.built.order.length).toBeGreaterThan(1);
    const innerName = pipeline.built.order[1]!;
    const inner = pipeline.optimized.programs[innerName]!;
    expect(countFailIfStatements(inner.statements)).toBeGreaterThan(1);

    const { helpers } = emitFromPipeline(pipeline, {
      prioritizeReadabilityOverCompactness: true,
      output: 'function',
      nameFunctionsByType: true,
    });
    const helperBody = helpers.match(/function \w+\(mixed \$value\): bool\n\{([\s\S]*)\n\}/)?.[1] ?? '';
    expect((helperBody.match(/\n\s+if \(!/g) ?? []).length).toBeGreaterThan(1);
  });
});
