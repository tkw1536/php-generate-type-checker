import { blockEquals } from '../../ir/equals.ts';
import type { CheckerIR } from '../../ir/types.ts';
import type { TraceScopeSnapshot } from './types.ts';

export function checkerIrEquals(a: CheckerIR, b: CheckerIR): boolean {
  if (a.order.length !== b.order.length) {
    return false;
  }
  for (let i = 0; i < a.order.length; i++) {
    if (a.order[i] !== b.order[i]) {
      return false;
    }
  }
  for (const name of a.order) {
    const left = a.programs[name];
    const right = b.programs[name];
    if (left === undefined || right === undefined) {
      return false;
    }
    if (!blockEquals(left.body, right.body)) {
      return false;
    }
  }
  return a.entries.length === b.entries.length;
}

export function scopeSnapEquals(
  a: TraceScopeSnapshot,
  b: TraceScopeSnapshot,
): boolean {
  if (a.kind !== b.kind) {
    return false;
  }
  if (a.kind === 'block' && b.kind === 'block') {
    return blockEquals(a.block, b.block);
  }
  if (a.kind === 'ir' && b.kind === 'ir') {
    return checkerIrEquals(a.ir, b.ir);
  }
  return false;
}
