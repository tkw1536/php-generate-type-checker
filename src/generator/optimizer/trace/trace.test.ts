import { describe, expect, it } from 'vitest';
import { parseType } from '../../../parser/index.ts';
import { buildMany } from '../../pipeline.ts';
import { optimize } from '../index.ts';
import { renderTraceSnapshot } from './render.ts';
import type { TraceStep } from './types.ts';
import {
  absorbImplicationPhp,
  allExclusiveViaUsesAreArrayKeyAssumed,
  allNestedStepsAreNormalize,
  exclusiveViaUses,
  hasExclusiveVia,
  hasInstanceofObjectImplication,
  isProveFactsRule,
  nestedStepsUnderRule,
  stepExplainsFactsRule,
} from './trace.test.helpers.ts';

const FACT_RULES = new Set([
  'facts.proveTrue',
  'facts.proveFalse',
  'facts.absorb',
  'facts.env.extend',
]);

function optimizeListUnionSteps(): readonly TraceStep[] {
  const ast = parseType('list<mixed>|list<string>');
  const { ir: built } = buildMany([ast]);
  return optimize(built).steps;
}

function ruleOf(step: TraceStep): string {
  return step.reason.rule;
}

function stepTouchesNormalize(step: TraceStep): boolean {
  if (ruleOf(step).startsWith('simplify.normalize.')) {
    return true;
  }
  for (const child of step.reason.children) {
    if (child.kind === 'step' && child.rule.startsWith('simplify.normalize.')) {
      return true;
    }
  }
  return false;
}

describe('optimize trace steps', () => {
  it('records fine-grained rewrite rules for list unions', () => {
    const ast = parseType('list<mixed>|list<string>');
    const { ir: built } = buildMany([ast]);
    const { ir, steps } = optimize(built);
    expect(ir.order.length).toBeGreaterThan(0);
    expect(steps.length).toBeGreaterThan(0);
    expect([...new Set(steps.map((s) => ruleOf(s)))]).toEqual(
      expect.arrayContaining(['flatten.fold', 'inline.substitute']),
    );
    expect(steps.map((e) => e.index)).toEqual([...steps.keys()]);
    expect(steps.every((e) => e.program.length > 0)).toBe(true);
  });

  it('tags program names so steps can be grouped by checker', () => {
    const steps = optimizeListUnionSteps();
    const programs = [...new Set(steps.map((e) => e.program))];
    expect(programs.length).toBeGreaterThan(1);
    expect(programs.every((p) => p.length > 0)).toBe(true);
  });

  it('includes every checker, each starting with trace.initial', () => {
    const ast = parseType('list<mixed>|list<string>');
    const { ir: built } = buildMany([ast]);
    const { steps } = optimize(built);
    const tracedPrograms = new Set(
      steps.map((e) => e.program).filter((p) => p !== '(prune)'),
    );
    expect([...tracedPrograms].toSorted()).toEqual([...built.order].toSorted());
    expect(
      built.order.every((name) => {
        const first = steps.find((e) => e.program === name);
        return first?.reason.rule === 'trace.initial';
      }),
    ).toBe(true);
  });

  it('stores focus after snapshots of expr, block, or ir', () => {
    const steps = optimizeListUnionSteps();
    expect(
      steps.every((e) =>
        (['expr', 'block', 'ir'] as const).includes(e.reason.focus.after.kind),
      ),
    ).toBe(true);
  });
});

describe('optimize trace scope and checker kinds', () => {
  it('stores scope before/after as block or ir only', () => {
    const steps = optimizeListUnionSteps();
    expect(
      steps.every((e) =>
        (['block', 'ir'] as const).includes(e.scope.before.kind),
      ),
    ).toBe(true);
    expect(
      steps.every((e) =>
        (['block', 'ir'] as const).includes(e.scope.after.kind),
      ),
    ).toBe(true);
  });

  it('stores checker before/after as block or ir only', () => {
    const steps = optimizeListUnionSteps();
    expect(
      steps.every((e) =>
        (['block', 'ir'] as const).includes(e.checker.before.kind),
      ),
    ).toBe(true);
    expect(
      steps.every((e) =>
        (['block', 'ir'] as const).includes(e.checker.after.kind),
      ),
    ).toBe(true);
  });
});

describe('optimize trace checker snapshots', () => {
  it('keeps full-checker PHP at least as large as the enclosing scope', () => {
    const events = optimizeListUnionSteps()
      .filter((e) => e.program !== '(prune)')
      .filter((e) => e.checker.before.kind === 'block');
    expect(events.length).toBeGreaterThan(0);
    expect(
      events.every((event) => {
        const checkerPhp = renderTraceSnapshot(event.checker.before);
        const scopePhp = renderTraceSnapshot(event.scope.before);
        return checkerPhp.length >= scopePhp.length;
      }),
    ).toBe(true);
  });

  it('traces identity folds through to the final array checker body', () => {
    const ast = parseType('array<int|string,mixed>');
    const { ir: built } = buildMany([ast]);
    const { ir, steps } = optimize(built);
    const entry = ir.entries[0];
    expect(entry).toBeTypeOf('string');
    const program = ir.programs[entry];
    expect(program).toBeDefined();
    const finalPhp = renderTraceSnapshot({
      kind: 'block',
      block: program.body,
    });
    expect(finalPhp).toContain('is_array($value)');
    expect(finalPhp).not.toContain('&&');
    const entryEvents = steps.filter((e) => e.program === entry);
    expect(entryEvents.some((e) => stepTouchesNormalize(e))).toBe(true);
    const last = entryEvents.at(-1)!;
    const lastPhp = renderTraceSnapshot(last.checker.after).replaceAll(
      /\s+/gu,
      ' ',
    );
    expect(lastPhp).toContain('return is_array($value);');
  });
});

function isNonEnvGhost(step: TraceStep): boolean {
  if (ruleOf(step) === 'facts.env.extend' || ruleOf(step) === 'trace.initial') {
    return false;
  }
  return (
    renderTraceSnapshot(step.checker.before) ===
    renderTraceSnapshot(step.checker.after)
  );
}

describe('optimize trace De Morgan collapse', () => {
  it('records one collapse without ghost doubleNeg on temps', () => {
    const ast = parseType('int|string');
    const { ir: built } = buildMany([ast]);
    const { ir, steps } = optimize(built);
    const entry = ir.entries[0];
    expect(entry).toBeTypeOf('string');
    const program = ir.programs[entry];
    expect(program).toBeDefined();
    const entryEvents = steps.filter((e) => e.program === entry);
    const deMorgans = entryEvents.filter(
      (e) => ruleOf(e) === 'simplify.normalize.deMorgan',
    );
    expect(deMorgans.length).toBeGreaterThan(0);
    expect(entryEvents.filter((e) => isNonEnvGhost(e))).toEqual([]);
    expect(
      entryEvents.some((e) => ruleOf(e) === 'simplify.normalize.doubleNeg'),
    ).toBe(false);
    const finalPhp = renderTraceSnapshot({
      kind: 'block',
      block: program.body,
    }).replaceAll(/\s+/gu, ' ');
    expect(finalPhp).toContain('is_int($value)');
    expect(finalPhp).toContain('is_string($value)');
  });
});

describe('optimize trace scope for expr rewrites', () => {
  it('uses block or ir scope for expression rewrites', () => {
    const exprEvents = optimizeListUnionSteps().filter(
      (e) => e.reason.focus.before.kind === 'expr',
    );
    expect(exprEvents.length).toBeGreaterThan(0);
    expect(
      exprEvents.every((e) =>
        (['block', 'ir'] as const).includes(e.scope.before.kind),
      ),
    ).toBe(true);
  });

  it('keeps non-empty blocks when scope is a block', () => {
    const blockScopes = optimizeListUnionSteps()
      .filter((e) => e.reason.focus.before.kind === 'expr')
      .map((e) => e.scope.before)
      .filter((s) => s.kind === 'block');
    expect(blockScopes.length).toBeGreaterThan(0);
    expect(blockScopes.every((s) => s.block.length > 0)).toBe(true);
  });
});

function explainsFactsDetail(): void {
  const factEvents = optimizeListUnionSteps().filter((e) =>
    FACT_RULES.has(ruleOf(e)),
  );
  expect(factEvents.length).toBeGreaterThan(0);
  expect(factEvents.every((e) => stepExplainsFactsRule(e))).toBe(true);
  const proveEvents = factEvents.filter((e) => isProveFactsRule(ruleOf(e)));
  expect(proveEvents.length).toBeGreaterThan(0);
  expect(
    proveEvents.every((e) => e.reason.children.length > 0),
  ).toBe(true);
}

function recordsInstanceofObjectAbsorb(): void {
  const ast = parseType('Thing|object');
  const { ir: built } = buildMany([ast]);
  const { steps } = optimize(built);
  const absorbs = steps.filter((e) => ruleOf(e) === 'facts.absorb');
  expect(absorbs.length).toBeGreaterThan(0);
  expect(hasInstanceofObjectImplication(absorbImplicationPhp(absorbs))).toBe(
    true,
  );
}

function tagsExclusiveViaForImpossibleArrayKey(): void {
  const ast = parseType('array<array, mixed>');
  const { ir: built } = buildMany([ast]);
  const { steps } = optimize(built);
  const proveTrue = steps.filter((e) => ruleOf(e) === 'facts.proveTrue');
  expect(proveTrue.length).toBeGreaterThan(0);
  expect(hasExclusiveVia(proveTrue)).toBe(true);
  const withVia = exclusiveViaUses(proveTrue);
  expect(withVia.length).toBeGreaterThan(0);
  expect(allExclusiveViaUsesAreArrayKeyAssumed(withVia)).toBe(true);
}

function nestedNormalizeStepsAreNormalize(): void {
  const nested = nestedStepsUnderRule(
    optimizeListUnionSteps(),
    'simplify.normalize.',
  );
  expect(nested.length).toBeGreaterThan(0);
  expect(allNestedStepsAreNormalize(nested)).toBe(true);
}

describe('optimize trace facts evidence', () => {
  it(
    'explains every facts.* step with facts or absorb implications',
    explainsFactsDetail,
  );
  it(
    'records instanceof ⇒ is_object on absorb for Thing|object',
    recordsInstanceofObjectAbsorb,
  );
  it(
    'tags exclusive via when array-key facts prove ¬is_array($key)',
    tagsExclusiveViaForImpossibleArrayKey,
  );
  it(
    'nested normalize steps use simplify.normalize.* rules when present',
    nestedNormalizeStepsAreNormalize,
  );
});

describe('optimize trace expand/absorb', () => {
  it('does not ping-pong expand/absorb on positive-int confirmation rounds', () => {
    const ast = parseType('positive-int');
    const { ir: built } = buildMany([ast]);
    const { steps } = optimize(built);
    const expands = steps.filter((e) => ruleOf(e) === 'simplify.expand');
    const absorbs = steps.filter((e) => ruleOf(e) === 'simplify.absorb');
    expect(expands.length).toBe(1);
    expect(absorbs.length).toBe(1);
  });
});
