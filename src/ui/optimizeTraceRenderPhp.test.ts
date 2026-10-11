import { describe, expect, it } from 'vitest';
import {
  callExpr,
  refArg,
  variableRef,
} from '../generator/ir/index.ts';
import { parseType } from '../parser/index.ts';
import { buildMany, optimize } from '../generator/pipeline.ts';
import { checkerPhpForEvent } from './optimizeTracePhp.ts';
import {
  eventTempNames,
  renderEventExpr,
  renderEventSnapshot,
} from './optimizeTraceRenderPhp.ts';

function requireEventWithTemps(
  trace: ReturnType<typeof optimize>['trace'],
): (typeof trace)[number] {
  for (const event of trace) {
    const temps = eventTempNames(event);
    if (temps !== undefined && temps.size > 0) {
      return event;
    }
  }
  throw new Error('missing event with temp names');
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

  it('uses Diff checker temp names for event snapshots', () => {
    const ast = parseType('non-empty-list<string>');
    const { ir: built } = buildMany([ast]);
    const { trace } = optimize(built);
    const event = requireEventWithTemps(trace);
    const temps = eventTempNames(event)!;
    const { beforePhp } = checkerPhpForEvent(event);
    for (const name of temps.values()) {
      expect(beforePhp).toContain(name);
    }
    const focusPhp = renderEventSnapshot(event.focus.before, temps);
    expect(focusAvoidsTmpAliases(focusPhp, temps)).toBe(true);
  });
});
