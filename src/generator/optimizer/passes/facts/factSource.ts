import type { FactOriginId, FactReasonId } from './env.ts';

export type FactSourceInfo = {
  readonly short: string;
  readonly help: string;
};

const ORIGIN_INFO: Record<FactOriginId, FactSourceInfo> = {
  ifTrue: {
    short: 'if true',
    help: 'Assumed true inside this if body (the condition held on this path).',
  },
  ifFalse: {
    short: 'if false',
    help: 'Assumed false after an early-returning if (later code only runs when the condition failed).',
  },
  arrayKey: {
    short: 'array key',
    help: 'Foreach over an array: keys are int or non-decimal-int-string.',
  },
};

const REASON_INFO: Record<FactReasonId, FactSourceInfo> = {
  assumed: {
    short: 'assumed',
    help: 'Directly assumed on that path.',
  },
  andSplit: {
    short: 'and',
    help: 'Expanded from a known-true AND: each conjunct is also true.',
  },
  orSplit: {
    short: 'or',
    help: 'Expanded from a known-false OR: each disjunct is also false.',
  },
  notFlip: {
    short: 'not',
    help: 'Polarity flip: known-true ¬P means P is false (and the reverse).',
  },
  commute: {
    short: 'commute',
    help: 'Operands of === / !== were swapped so either order matches as the same fact.',
  },
  deMorgan: {
    short: 'De Morgan',
    help: 'Junction rewritten via De Morgan for the fact environment.',
  },
  exclusive: {
    short: 'exclusive',
    help: 'Other primary-type tags are false when one tag is known (bool/int/float/string/array/object/resource/null).',
  },
  equalityType: {
    short: 'equality',
    help: 'Typed literal equality implies the matching is_* check (e.g. $x === 0 ⇒ is_int($x)).',
  },
  instanceofObject: {
    short: 'instanceof',
    help: 'From $x instanceof T implying is_object($x).',
  },
  isAClassExists: {
    short: 'is_a',
    help: 'is_a(..., TRUE) implies class_exists on the subject.',
  },
  structural: {
    short: 'structural',
    help: 'Operand dropped because another operand structurally implies it (no path fact required).',
  },
};

/** Short label for Trace UI: origin when assumed, otherwise the implication reason. */
export function factSourceShort(
  origin: FactOriginId,
  reason: FactReasonId,
): string {
  if (reason === 'assumed') {
    return ORIGIN_INFO[origin].short;
  }
  return REASON_INFO[reason].short;
}

/** Longer (?) help combining path origin and implication reason. */
export function factSourceHelp(
  origin: FactOriginId,
  reason: FactReasonId,
): string {
  const originHelp = ORIGIN_INFO[origin].help;
  if (reason === 'assumed') {
    return originHelp;
  }
  return `${REASON_INFO[reason].help} (on the “${ORIGIN_INFO[origin].short}” path: ${originHelp})`;
}
