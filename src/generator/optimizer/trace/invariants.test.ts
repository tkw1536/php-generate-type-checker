import { describe, expect, it } from 'vitest';
import { parseCheckerInput } from '../../../parser/parseInput.ts';
import { loadFixtures } from '../../index.test.ts';
import { blockEquals } from '../../ir/equals.ts';
import type { Block, CheckerIR, CheckerProgram } from '../../ir/types.ts';
import { buildEntries, optimize } from '../../pipeline.ts';
import { checkerIrEquals, scopeSnapEquals } from './snapEquals.ts';
import type { OptimizeTraceEvent } from './types.ts';

function groupByProgram(
  trace: readonly OptimizeTraceEvent[],
): Map<string, OptimizeTraceEvent[]> {
  const byProgram = new Map<string, OptimizeTraceEvent[]>();
  for (const event of trace) {
    const existing = byProgram.get(event.program);
    if (existing === undefined) {
      byProgram.set(event.program, [event]);
    } else {
      existing.push(event);
    }
  }
  return byProgram;
}

function requireProgram(built: CheckerIR, name: string): CheckerProgram {
  const program = built.programs[name];
  if (program === undefined) {
    throw new Error(`missing program ${name}`);
  }
  return program;
}

function eventsFor(
  byProgram: ReadonlyMap<string, OptimizeTraceEvent[]>,
  name: string,
): readonly OptimizeTraceEvent[] {
  const events = byProgram.get(name);
  if (events === undefined) {
    return [];
  }
  return events;
}

function optimizedBodyFor(
  optimized: CheckerIR,
  name: string,
): Block | undefined {
  return optimized.programs[name]?.body;
}

function assertProgramTraceHonesty(
  name: string,
  events: readonly OptimizeTraceEvent[],
  builtBody: Block,
  optimizedBody: Block | undefined,
): void {
  expect(events.length, `${name}: expected at least one event`).toBeGreaterThan(
    0,
  );
  const first = events.at(0);
  const last = events.at(-1);
  expect(first).toBeDefined();
  expect(last).toBeDefined();
  expect(
    first !== undefined &&
      first.checker.before.kind === 'block' &&
      blockEquals(first.checker.before.block, builtBody),
    `${name}: first checker.before must equal builder body`,
  ).toBe(true);

  expect(
    optimizedBody === undefined ||
      (last !== undefined &&
        last.checker.after.kind === 'block' &&
        blockEquals(last.checker.after.block, optimizedBody)),
    `${name}: last checker.after must equal optimized body`,
  ).toBe(true);

  for (let i = 0; i < events.length - 1; i++) {
    expect(
      scopeSnapEquals(events[i].checker.after, events[i + 1].checker.before),
      `${name}: checker.after[${i}] (${events[i].rule}) must equal checker.before[${i + 1}] (${events[i + 1].rule})`,
    ).toBe(true);
  }

  for (const event of events) {
    expect(
      event.rule === 'trace.baseline' ||
        !scopeSnapEquals(event.checker.before, event.checker.after),
      `${name}: ghost rewrite ${event.rule}`,
    ).toBe(true);
    assertFactsEventHasSources(name, event);
  }
}

const FACT_RULES = new Set([
  'facts.proveTrue',
  'facts.proveFalse',
  'facts.absorb',
]);

function assertFactUsesHaveSources(
  name: string,
  rule: string,
  used: readonly {
    readonly origin: string;
    readonly reason: string;
  }[],
): void {
  for (const fact of used) {
    expect(fact.origin.length, `${name}: ${rule} fact origin`).toBeGreaterThan(
      0,
    );
    expect(fact.reason.length, `${name}: ${rule} fact reason`).toBeGreaterThan(
      0,
    );
  }
}

function assertFactsEventHasSources(
  name: string,
  event: OptimizeTraceEvent,
): void {
  if (!FACT_RULES.has(event.rule)) {
    return;
  }
  if (event.rule === 'facts.absorb') {
    expect(
      event.detail.kind === 'absorb',
      `${name}: ${event.rule} must carry absorb detail`,
    ).toBe(true);
    if (event.detail.kind !== 'absorb') {
      return;
    }
    expect(
      event.detail.implications.length,
      `${name}: ${event.rule} must list implications`,
    ).toBeGreaterThan(0);
    assertFactUsesHaveSources(name, event.rule, event.detail.used);
    return;
  }
  expect(
    event.detail.kind === 'facts',
    `${name}: ${event.rule} must carry facts detail`,
  ).toBe(true);
  if (event.detail.kind !== 'facts') {
    return;
  }
  expect(
    event.detail.used.length,
    `${name}: ${event.rule} must list used facts`,
  ).toBeGreaterThan(0);
  assertFactUsesHaveSources(name, event.rule, event.detail.used);
}

function assertPruneTraceHonesty(
  events: readonly OptimizeTraceEvent[],
  optimized: CheckerIR,
): void {
  const last = events.at(-1);
  expect(last).toBeDefined();
  expect(
    last !== undefined &&
      last.checker.after.kind === 'ir' &&
      checkerIrEquals(last.checker.after.ir, optimized),
    'last prune checker.after must equal optimized IR',
  ).toBe(true);

  for (let i = 0; i < events.length - 1; i++) {
    expect(
      scopeSnapEquals(events[i].checker.after, events[i + 1].checker.before),
      `prune: checker.after[${i}] must equal checker.before[${i + 1}]`,
    ).toBe(true);
  }

  for (const event of events) {
    expect(
      !scopeSnapEquals(event.checker.before, event.checker.after),
      `prune: ghost rewrite ${event.rule}`,
    ).toBe(true);
  }
}

function assertAllProgramsHonest(
  built: CheckerIR,
  optimized: CheckerIR,
  byProgram: ReadonlyMap<string, OptimizeTraceEvent[]>,
): void {
  for (const name of built.order) {
    const program = requireProgram(built, name);
    assertProgramTraceHonesty(
      name,
      eventsFor(byProgram, name),
      program.body,
      optimizedBodyFor(optimized, name),
    );
  }
}

function assertPruneGroup(
  events: readonly OptimizeTraceEvent[] | undefined,
  optimized: CheckerIR,
): void {
  const list = events ?? [];
  expect(Array.isArray(list)).toBe(true);
  if (list.length === 0) {
    return;
  }
  assertPruneTraceHonesty(list, optimized);
}

const successFixtures = loadFixtures().filter((f) => !f.expectsError);

describe('optimize trace honesty (generator fixtures)', () => {
  it.each(successFixtures)('$name', (fixture) => {
    const entries = parseCheckerInput(fixture.input, {});
    const { ir: built } = buildEntries(entries, {
      output: fixture.output,
      verbosePhpdoc: fixture.verbosePhpdoc,
      segmentSources: entries.map((e) => e.typeString),
    });
    const { ir: optimized, stats, trace } = optimize(built);
    const byProgram = groupByProgram(trace);
    expect(built.order.length).toBeGreaterThan(0);
    assertAllProgramsHonest(built, optimized, byProgram);
    assertPruneGroup(byProgram.get('(prune)'), optimized);
    expect(stats.outerFixpointCapped, `${fixture.name}: outer capped`).toBe(
      false,
    );
    expect(stats.blockFixpointCapped, `${fixture.name}: block capped`).toBe(
      false,
    );
    expect(
      stats.simplifyFixpointCapped,
      `${fixture.name}: simplify capped`,
    ).toBe(false);
    expect(
      stats.exprNormalizeCapped,
      `${fixture.name}: expr normalize capped`,
    ).toBe(false);
  });
});
