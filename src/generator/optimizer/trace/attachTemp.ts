import type { OptimizeTraceSnapshot, TraceScopeSnapshot } from './types.ts';

export function attachTempNames(
  snap: OptimizeTraceSnapshot,
  tempNames: ReadonlyMap<number, string> | null,
): OptimizeTraceSnapshot {
  if (snap.kind === 'block') {
    return {
      kind: 'block',
      block: snap.block,
      tempNames: snap.tempNames ?? tempNames,
    };
  }
  return snap;
}

export function attachScopeTempNames(
  snap: TraceScopeSnapshot,
  tempNames: ReadonlyMap<number, string> | null,
): TraceScopeSnapshot {
  if (snap.kind === 'block') {
    return {
      kind: 'block',
      block: snap.block,
      tempNames: snap.tempNames ?? tempNames,
    };
  }
  return snap;
}
