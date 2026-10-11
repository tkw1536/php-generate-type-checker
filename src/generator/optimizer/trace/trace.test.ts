import { describe, expect, it } from 'vitest';
import { parseType } from '../../../parser/index.ts';
import { buildMany } from '../../pipeline.ts';
import { optimize } from '../index.ts';
import { renderTraceSnapshot } from './render.ts';
import type { OptimizeTraceDetail, OptimizeTraceEvent } from './types.ts';

function factUsedCount(detail: OptimizeTraceDetail): number {
  if (detail.kind !== 'facts') {
    return 0;
  }
  return detail.used.length;
}

function factKnownLabels(detail: OptimizeTraceDetail): readonly string[] {
  if (detail.kind !== 'facts') {
    return [];
  }
  return detail.used.map((f) => f.known);
}

function factUsesFromEvents(
  events: readonly OptimizeTraceEvent[],
): readonly { readonly origin: string; readonly reason: string }[] {
  const uses: { readonly origin: string; readonly reason: string }[] = [];
  for (const e of events) {
    if (e.detail.kind !== 'facts') {
      continue;
    }
    for (const f of e.detail.used) {
      uses.push({ origin: f.origin, reason: f.reason });
    }
  }
  return uses;
}

function allFactUsesHaveSources(
  uses: readonly { readonly origin: string; readonly reason: string }[],
): boolean {
  for (const f of uses) {
    if (f.origin.length === 0 || f.reason.length === 0) {
      return false;
    }
  }
  return true;
}

function nestedStepsFromEvents(
  events: readonly OptimizeTraceEvent[],
): readonly { readonly rule: string }[] {
  const steps: { readonly rule: string }[] = [];
  for (const e of events) {
    if (e.detail.kind !== 'nested') {
      continue;
    }
    for (const s of e.detail.steps) {
      steps.push({ rule: s.rule });
    }
  }
  return steps;
}

function allNestedStepsAreNormalize(
  steps: readonly { readonly rule: string }[],
): boolean {
  for (const s of steps) {
    if (!s.rule.startsWith('simplify.normalize.')) {
      return false;
    }
  }
  return true;
}

const FACT_RULES = new Set([
  'facts.proveTrue',
  'facts.proveFalse',
  'facts.absorb',
]);

function optimizeListUnionTrace(): readonly OptimizeTraceEvent[] {
  const ast = parseType('list<mixed>|list<string>');
  const { ir: built } = buildMany([ast]);
  return optimize(built).trace;
}

describe('optimize trace events', () => {
  it('records fine-grained rewrite rules for list unions', () => {
    const ast = parseType('list<mixed>|list<string>');
    const { ir: built } = buildMany([ast]);
    const { ir, trace } = optimize(built);
    expect(ir.order.length).toBeGreaterThan(0);
    expect(trace.length).toBeGreaterThan(0);
    expect([...new Set(trace.map((e) => e.rule))]).toEqual(
      expect.arrayContaining(['flatten.fold', 'inline.substitute']),
    );
    expect(trace.map((e) => e.index)).toEqual([...trace.keys()]);
    expect(trace.every((e) => e.program.length > 0)).toBe(true);
  });

  it('tags program names so events can be grouped by checker', () => {
    const trace = optimizeListUnionTrace();
    const programs = [...new Set(trace.map((e) => e.program))];
    expect(programs.length).toBeGreaterThan(1);
    expect(programs.every((p) => p.length > 0)).toBe(true);
  });

  it('includes every checker, with a baseline when nothing rewrote it', () => {
    const ast = parseType('list<mixed>|list<string>');
    const { ir: built } = buildMany([ast]);
    const { trace } = optimize(built);
    const tracedPrograms = new Set(
      trace.map((e) => e.program).filter((p) => p !== '(prune)'),
    );
    expect([...tracedPrograms].toSorted()).toEqual([...built.order].toSorted());
    expect(
      built.order.every((name) =>
        trace.some((e) => e.program === name),
      ),
    ).toBe(true);
  });

  it('stores focus after snapshots of expr, block, or ir', () => {
    const trace = optimizeListUnionTrace();
    expect(
      trace.every((e) =>
        (['expr', 'block', 'ir'] as const).includes(e.focus.after.kind),
      ),
    ).toBe(true);
  });
});

describe('optimize trace scope and checker kinds', () => {
  it('stores scope before/after as block or ir only', () => {
    const trace = optimizeListUnionTrace();
    expect(
      trace.every((e) =>
        (['block', 'ir'] as const).includes(e.scope.before.kind),
      ),
    ).toBe(true);
    expect(
      trace.every((e) =>
        (['block', 'ir'] as const).includes(e.scope.after.kind),
      ),
    ).toBe(true);
  });

  it('stores checker before/after as block or ir only', () => {
    const trace = optimizeListUnionTrace();
    expect(
      trace.every((e) =>
        (['block', 'ir'] as const).includes(e.checker.before.kind),
      ),
    ).toBe(true);
    expect(
      trace.every((e) =>
        (['block', 'ir'] as const).includes(e.checker.after.kind),
      ),
    ).toBe(true);
  });
});

describe('optimize trace checker snapshots', () => {
  it('keeps full-checker PHP at least as large as the enclosing scope', () => {
    const events = optimizeListUnionTrace()
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
    const { ir, trace } = optimize(built);
    const entry = ir.entries[0];
    expect(entry).toBeTypeOf('string');
    const program = ir.programs[entry];
    expect(program).toBeDefined();
    const finalPhp = renderTraceSnapshot({
      kind: 'block',
      block: program.body,
      tempNames: null,
    });
    expect(finalPhp).toContain('is_array($value)');
    expect(finalPhp).not.toContain('&&');
    const entryEvents = trace.filter((e) => e.program === entry);
    expect(entryEvents.some((e) => e.rule === 'simplify.normalize.identity')).toBe(
      true,
    );
    const last = entryEvents.at(-1);
    expect(last).toBeDefined();
    const lastPhp = renderTraceSnapshot(last.checker.after).replaceAll(
      /\s+/gu,
      ' ',
    );
    expect(lastPhp).toContain('return is_array($value);');
  });
});

describe('optimize trace De Morgan collapse', () => {
  it('records one collapse without ghost doubleNeg on temps', () => {
    const ast = parseType('int|string');
    const { ir: built } = buildMany([ast]);
    const { ir, trace } = optimize(built);
    const entry = ir.entries[0];
    expect(entry).toBeTypeOf('string');
    const program = ir.programs[entry];
    expect(program).toBeDefined();
    const entryEvents = trace.filter((e) => e.program === entry);
    const deMorgans = entryEvents.filter(
      (e) => e.rule === 'simplify.normalize.deMorgan',
    );
    expect(deMorgans.length).toBeGreaterThan(0);
    expect(
      entryEvents.filter((e) => {
        const before = renderTraceSnapshot(e.checker.before);
        const after = renderTraceSnapshot(e.checker.after);
        return before === after;
      }),
    ).toEqual([]);
    expect(
      entryEvents.some((e) => e.rule === 'simplify.normalize.doubleNeg'),
    ).toBe(false);
    const finalPhp = renderTraceSnapshot({
      kind: 'block',
      block: program.body,
      tempNames: null,
    }).replaceAll(/\s+/gu, ' ');
    expect(finalPhp).toContain('is_int($value)');
    expect(finalPhp).toContain('is_string($value)');
  });
});

describe('optimize trace scope for expr rewrites', () => {
  it('uses block or ir scope at least as large as the focus', () => {
    const exprEvents = optimizeListUnionTrace().filter(
      (e) => e.focus.before.kind === 'expr',
    );
    expect(exprEvents.length).toBeGreaterThan(0);
    expect(
      exprEvents.every((e) =>
        (['block', 'ir'] as const).includes(e.scope.before.kind),
      ),
    ).toBe(true);
    expect(
      exprEvents.every((event) => {
        const focusPhp = renderTraceSnapshot(event.focus.before);
        const scopePhp = renderTraceSnapshot(event.scope.before);
        return scopePhp.length >= focusPhp.length;
      }),
    ).toBe(true);
  });

  it('keeps non-empty blocks when scope is a block', () => {
    const blockScopes = optimizeListUnionTrace()
      .filter((e) => e.focus.before.kind === 'expr')
      .map((e) => e.scope.before)
      .filter((s) => s.kind === 'block');
    expect(blockScopes.length).toBeGreaterThan(0);
    expect(blockScopes.every((s) => s.block.length > 0)).toBe(true);
  });
});

describe('optimize trace facts detail', () => {
  it('lists used facts with sources on every facts.* event', () => {
    const factEvents = optimizeListUnionTrace().filter((e) =>
      FACT_RULES.has(e.rule),
    );
    expect(factEvents.length).toBeGreaterThan(0);
    expect(factEvents.every((e) => e.detail.kind === 'facts')).toBe(true);
    expect(
      Math.min(...factEvents.map((e) => factUsedCount(e.detail))),
    ).toBeGreaterThan(0);
    const known = factEvents.flatMap((e) => factKnownLabels(e.detail));
    expect(known.length).toBeGreaterThan(0);
    expect(known.every((k) => (['true', 'false'] as const).includes(k))).toBe(
      true,
    );
    const uses = factUsesFromEvents(factEvents);
    expect(uses.length).toBeGreaterThan(0);
    expect(allFactUsesHaveSources(uses)).toBe(true);
  });

  it('nested normalize steps use simplify.normalize.* rules when present', () => {
    const steps = nestedStepsFromEvents(optimizeListUnionTrace());
    expect(allNestedStepsAreNormalize(steps)).toBe(true);
  });
});
