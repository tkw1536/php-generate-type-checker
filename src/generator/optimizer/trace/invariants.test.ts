import { describe, expect, it } from 'vitest';
import { parseCheckerInput } from '../../../parser/parseInput.ts';
import { loadFixtures } from '../../index.test.ts';
import { blockEquals } from '../../ir/equals.ts';
import type { Block, CheckerIR, CheckerProgram } from '../../ir/types.ts';
import { buildEntries, optimize } from '../../pipeline.ts';
import { checkerIrEquals, scopeSnapEquals } from './snapEquals.ts';
import type { TraceReasoning, TraceStep, TraceStepReason } from './types.ts';

function groupByProgram(
  steps: readonly TraceStep[],
): Map<string, TraceStep[]> {
  const byProgram = new Map<string, TraceStep[]>();
  for (const step of steps) {
    const existing = byProgram.get(step.program);
    if (existing === undefined) {
      byProgram.set(step.program, [step]);
    } else {
      existing.push(step);
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

function stepsFor(
  byProgram: ReadonlyMap<string, TraceStep[]>,
  name: string,
): readonly TraceStep[] {
  return byProgram.get(name) ?? [];
}

function optimizedBodyFor(
  optimized: CheckerIR,
  name: string,
): Block | undefined {
  return optimized.programs[name]?.body;
}

function assertProgramTraceHonesty(
  name: string,
  steps: readonly TraceStep[],
  builtBody: Block,
  optimizedBody: Block | undefined,
): void {
  expect(steps.length, `${name}: expected at least one step`).toBeGreaterThan(
    0,
  );
  const first = steps.at(0);
  const last = steps.at(-1);
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

  assertCheckerChain(name, steps);
  assertNoConsecutiveEnvExtend(name, steps);

  for (const step of steps) {
    expect(
      step.reason.rule === 'trace.baseline' ||
        step.reason.rule === 'facts.env.extend' ||
        !scopeSnapEquals(step.checker.before, step.checker.after),
      `${name}: ghost rewrite ${step.reason.rule}`,
    ).toBe(true);
    assertReasonProofs(name, step.reason);
  }
}

function assertCheckerChain(name: string, steps: readonly TraceStep[]): void {
  for (let i = 0; i < steps.length - 1; i++) {
    expect(
      scopeSnapEquals(steps[i].checker.after, steps[i + 1].checker.before),
      `${name}: checker.after[${i}] (${steps[i].reason.rule}) must equal checker.before[${i + 1}] (${steps[i + 1].reason.rule})`,
    ).toBe(true);
  }
}

function assertNoConsecutiveEnvExtend(
  name: string,
  steps: readonly TraceStep[],
): void {
  for (let i = 0; i < steps.length - 1; i++) {
    expect(
      !(
        steps[i].reason.rule === 'facts.env.extend' &&
        steps[i + 1].reason.rule === 'facts.env.extend'
      ),
      `${name}: consecutive facts.env.extend must be merged`,
    ).toBe(true);
  }
}

function childRules(reason: TraceStepReason): readonly string[] {
  const out: string[] = [];
  const walk = (r: TraceReasoning): void => {
    if (r.kind === 'seq') {
      for (const p of r.parts) {
        walk(p);
      }
      return;
    }
    if (r.kind !== 'step') {
      return;
    }
    out.push(r.rule);
    for (const c of r.children) {
      walk(c);
    }
  };
  for (const c of reason.children) {
    walk(c);
  }
  return out;
}

function bottomsOutAtAssumed(reason: TraceStepReason): boolean {
  return (
    childRules(reason).includes('facts.env.assumed') ||
    reason.rule === 'facts.env.assumed'
  );
}

function assertReasonProofs(name: string, reason: TraceReasoning): void {
  if (reason.kind === 'seq') {
    for (const part of reason.parts) {
      assertReasonProofs(name, part);
    }
    return;
  }
  if (reason.kind !== 'step') {
    return;
  }
  assertFactsStepHasProof(name, reason);
  for (const child of reason.children) {
    assertReasonProofs(name, child);
  }
}

function assertFactsStepHasProof(name: string, reason: TraceStepReason): void {
  const rule = reason.rule;
  if (rule === 'facts.env.extend') {
    expect(
      reason.children.length,
      `${name}: facts.env.extend must have children`,
    ).toBeGreaterThan(0);
    expect(
      childRules(reason).some((r) => r.startsWith('facts.env.')),
      `${name}: facts.env.extend children`,
    ).toBe(true);
    return;
  }
  if (rule === 'facts.absorb') {
    expect(
      childRules(reason).some(
        (r) => r === 'facts.absorb.implies' || r.startsWith('facts.imply.'),
      ),
      `${name}: facts.absorb must nest implication proof`,
    ).toBe(true);
    return;
  }
  if (rule === 'facts.proveTrue' || rule === 'facts.proveFalse') {
    expect(
      childRules(reason).length,
      `${name}: ${rule} must nest proof children`,
    ).toBeGreaterThan(0);
    expect(
      bottomsOutAtAssumed(reason),
      `${name}: ${rule} proof must bottom out at facts.env.assumed`,
    ).toBe(true);
    return;
  }
  if (rule === 'simplify.normalize.absorb') {
    expect(
      childRules(reason).some((r) => r.startsWith('facts.imply.')),
      `${name}: simplify.normalize.absorb must nest imply proof`,
    ).toBe(true);
  }
}

function assertPruneTraceHonesty(
  steps: readonly TraceStep[],
  optimized: CheckerIR,
): void {
  const last = steps.at(-1);
  expect(last).toBeDefined();
  expect(
    last !== undefined &&
      last.checker.after.kind === 'ir' &&
      checkerIrEquals(last.checker.after.ir, optimized),
    'last prune checker.after must equal optimized IR',
  ).toBe(true);

  for (let i = 0; i < steps.length - 1; i++) {
    expect(
      scopeSnapEquals(steps[i].checker.after, steps[i + 1].checker.before),
      `prune: checker.after[${i}] must equal checker.before[${i + 1}]`,
    ).toBe(true);
  }

  for (const step of steps) {
    expect(
      !scopeSnapEquals(step.checker.before, step.checker.after),
      `prune: ghost rewrite ${step.reason.rule}`,
    ).toBe(true);
  }
}

function assertAllProgramsHonest(
  built: CheckerIR,
  optimized: CheckerIR,
  byProgram: ReadonlyMap<string, TraceStep[]>,
): void {
  for (const name of built.order) {
    const program = requireProgram(built, name);
    assertProgramTraceHonesty(
      name,
      stepsFor(byProgram, name),
      program.body,
      optimizedBodyFor(optimized, name),
    );
  }
}

function assertPruneGroup(
  steps: readonly TraceStep[] | undefined,
  optimized: CheckerIR,
): void {
  const list = steps ?? [];
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
    const { ir: optimized, stats, steps } = optimize(built);
    const byProgram = groupByProgram(steps);
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
