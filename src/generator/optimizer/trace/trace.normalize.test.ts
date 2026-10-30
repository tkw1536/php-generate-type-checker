import { describe, expect, it } from 'vitest';
import { parseType } from '../../../parser/index.ts';
import { buildMany } from '../../pipeline.ts';
import { optimize } from '../index.ts';
import { renderTraceSnapshot } from './render.ts';
import type { TraceStep } from './types.ts';
import {
  allNestedStepsAreNormalize,
  nestedStepsUnderRule,
  noTopLevelNormalizeMicros,
  normalizePackagesHaveMicroChildren,
  optimizeListUnionSteps,
  packagesNestRule,
} from './trace.test.helpers.ts';

function isNonEnvGhost(step: TraceStep): boolean {
  if (step.reason.rule === 'trace.initial') {
    return false;
  }
  return (
    renderTraceSnapshot(step.checker.before) ===
    renderTraceSnapshot(step.checker.after)
  );
}

function recordsDeMorganUnderNormalizePackage(): void {
  const ast = parseType('int|string');
  const { ir: built } = buildMany([ast]);
  const { ir, steps } = optimize(built);
  const entry = ir.entries[0];
  expect(entry).toBeTypeOf('string');
  const program = ir.programs[entry];
  expect(program).toBeDefined();
  const entryEvents = steps.filter((e) => e.program === entry);
  expect(
    packagesNestRule(entryEvents, 'simplify.normalize.deMorgan'),
  ).toBe(true);
  expect(entryEvents.filter((e) => isNonEnvGhost(e))).toEqual([]);
  expect(noTopLevelNormalizeMicros(entryEvents)).toBe(true);
  const finalPhp = renderTraceSnapshot({
    kind: 'block',
    block: program.body,
  }).replaceAll(/\s+/gu, ' ');
  expect(finalPhp).toContain('is_int($value)');
  expect(finalPhp).toContain('is_string($value)');
}

function normalizePackageLabelsMicrosNested(): void {
  const steps = optimizeListUnionSteps();
  expect(normalizePackagesHaveMicroChildren(steps)).toBe(true);
  expect(noTopLevelNormalizeMicros(steps)).toBe(true);
}

function nestedNormalizeStepsAreNormalize(): void {
  const nested = nestedStepsUnderRule(
    optimizeListUnionSteps(),
    'simplify.normalize',
  );
  expect(nested.length).toBeGreaterThan(0);
  expect(allNestedStepsAreNormalize(nested)).toBe(true);
}

function flattenNotMislabelledAsIdentity(): void {
  const ast = parseType('array<non-decimal-int-string,string>');
  const { ir: built } = buildMany([ast]);
  const { steps } = optimize(built);
  const nested = nestedStepsUnderRule(steps, 'simplify.normalize');
  expect(nested.some((s) => s.rule === 'simplify.normalize.flatten')).toBe(
    true,
  );
}

describe('optimize trace De Morgan collapse', () => {
  it(
    'records one collapse without ghost doubleNeg on temps',
    recordsDeMorganUnderNormalizePackage,
  );
});

describe('optimize trace normalize package', () => {
  it(
    'labels checker-advancing normalize as simplify.normalize with micro children',
    normalizePackageLabelsMicrosNested,
  );
  it(
    'nested normalize steps use simplify.normalize.* rules when present',
    nestedNormalizeStepsAreNormalize,
  );
});

describe('optimize trace flatten vs identity', () => {
  it(
    'attributes associative rebuild to flatten, not identity',
    flattenNotMislabelledAsIdentity,
  );
});
