import { describe, expect, it } from 'vitest';
import {
  callExpr,
  refArg,
  variableRef,
} from '../generator/ir/index.ts';
import { parseType } from '../parser/index.ts';
import { buildMany, optimize } from '../generator/pipeline.ts';
import { checkerPhpForStep } from './optimizeTracePhp.ts';
import {
  renderEventExpr,
  renderEventSnapshot,
  stepTempNames,
} from './optimizeTraceRenderPhp.ts';

function requireStepWithTemps(
  steps: ReturnType<typeof optimize>['steps'],
): (typeof steps)[number] {
  for (const step of steps) {
    const temps = stepTempNames(step);
    if (temps !== undefined && temps.size > 0) {
      return step;
    }
  }
  throw new Error('missing step with temp names');
}

function focusAvoidsTmpAliases(
  focusPhp: string,
  temps: ReadonlyMap<number, string>,
): boolean {
  for (const id of temps.keys()) {
    if (focusPhp.includes(`$tmp${id}`)) {
      return false;
    }
  }
  return true;
}

describe('optimizeTraceRenderPhp', () => {
  it('maps IR temp ids with the provided name map', () => {
    const expr = callExpr('is_string', [refArg(variableRef(0))]);
    const names = new Map([[0, '$item']]);
    expect(renderEventExpr(expr, names)).toBe('is_string($item)');
    expect(renderEventExpr(expr)).toBe('is_string($tmp0)');
  });

  it('uses Diff checker temp names for step snapshots', () => {
    const ast = parseType('non-empty-list<string>');
    const { ir: built } = buildMany([ast]);
    const { steps } = optimize(built);
    const step = requireStepWithTemps(steps);
    const temps = stepTempNames(step)!;
    const { beforePhp } = checkerPhpForStep(step);
    for (const name of temps.values()) {
      expect(beforePhp).toContain(name);
    }
    const focusPhp = renderEventSnapshot(step.reason.focus.before, temps);
    expect(focusAvoidsTmpAliases(focusPhp, temps)).toBe(true);
  });
});
