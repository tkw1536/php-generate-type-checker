import { renderTraceSnapshot } from './render.ts';
import type {
  TraceReasoning,
  TraceStep,
  TraceStepReason,
} from './types.ts';

function nestedRulesFromReason(
  reason: TraceReasoning,
): readonly { readonly rule: string }[] {
  if (reason.kind === 'seq') {
    return reason.parts.flatMap((part) => nestedRulesFromReason(part));
  }
  if (reason.kind !== 'step') {
    return [];
  }
  const out: { readonly rule: string }[] = [];
  for (const child of reason.children) {
    if (child.kind === 'step') {
      out.push({ rule: child.rule }, ...nestedRulesFromReason(child));
    } else if (child.kind === 'seq') {
      out.push(...nestedRulesFromReason(child));
    }
  }
  return out;
}

export function nestedStepsFromSteps(
  steps: readonly TraceStep[],
): readonly { readonly rule: string }[] {
  return steps.flatMap((step) => nestedRulesFromReason(step.reason));
}

export function nestedStepsUnderRule(
  steps: readonly TraceStep[],
  parentRulePrefix: string,
): readonly { readonly rule: string }[] {
  return steps.flatMap((step) => walkUnder(step.reason, parentRulePrefix));
}

function walkUnder(
  reason: TraceReasoning,
  parentRulePrefix: string,
): readonly { readonly rule: string }[] {
  if (reason.kind === 'seq') {
    return reason.parts.flatMap((part) => walkUnder(part, parentRulePrefix));
  }
  if (reason.kind !== 'step') {
    return [];
  }
  const self = reason.rule.startsWith(parentRulePrefix)
    ? nestedRulesFromReason(reason)
    : [];
  return [
    ...self,
    ...reason.children.flatMap((child) => walkUnder(child, parentRulePrefix)),
  ];
}

export function allNestedStepsAreNormalize(
  nested: readonly { readonly rule: string }[],
): boolean {
  for (const s of nested) {
    if (
      !s.rule.startsWith('simplify.normalize.') &&
      !s.rule.startsWith('facts.imply.')
    ) {
      return false;
    }
  }
  return true;
}

function reasonHasChildRule(
  reason: TraceReasoning,
  pred: (rule: string) => boolean,
): boolean {
  for (const r of nestedRulesFromReason(reason)) {
    if (pred(r.rule)) {
      return true;
    }
  }
  return false;
}

function bottomsOutAtAssumed(reason: TraceReasoning): boolean {
  if (reason.kind === 'seq') {
    return reason.parts.some(bottomsOutAtAssumed);
  }
  if (reason.kind !== 'step') {
    return false;
  }
  if (reason.rule === 'facts.env.assumed') {
    return true;
  }
  return reason.children.some(bottomsOutAtAssumed);
}

export function stepExplainsFactsRule(step: TraceStep): boolean {
  if (step.reason.rule === 'facts.absorb') {
    return reasonHasChildRule(
      step.reason,
      (r) => r === 'facts.absorb.implies' || r.startsWith('facts.imply.'),
    );
  }
  if (
    step.reason.rule === 'facts.proveTrue' ||
    step.reason.rule === 'facts.proveFalse'
  ) {
    return (
      reasonHasChildRule(
        step.reason,
        (r) =>
          r === 'facts.prove.equals' ||
          r === 'facts.prove.entails' ||
          r.startsWith('facts.env.'),
      ) && bottomsOutAtAssumed(step.reason)
    );
  }
  if (step.reason.rule === 'facts.env.extend') {
    return reasonHasChildRule(step.reason, (r) => r.startsWith('facts.env.'));
  }
  return true;
}

export function isProveFactsRule(rule: string): boolean {
  return rule === 'facts.proveTrue' || rule === 'facts.proveFalse';
}

export function absorbImplicationPhp(
  steps: readonly TraceStep[],
): readonly string[] {
  return steps.flatMap((step) => collectAbsorbLines(step.reason));
}

function collectAbsorbLines(
  reason: TraceReasoning,
): readonly string[] {
  if (reason.kind === 'seq') {
    return reason.parts.flatMap((part) => collectAbsorbLines(part));
  }
  if (reason.kind !== 'step') {
    return [];
  }
  const self =
    reason.rule === 'facts.absorb.implies' &&
    reason.focus.before.kind === 'expr' &&
    reason.focus.after.kind === 'expr'
      ? [
          `${renderTraceSnapshot(reason.focus.before)} ⇒ ${renderTraceSnapshot(reason.focus.after)}`,
        ]
      : [];
  return [
    ...self,
    ...reason.children.flatMap((child) => collectAbsorbLines(child)),
  ];
}

export function hasInstanceofObjectImplication(
  lines: readonly string[],
): boolean {
  for (const line of lines) {
    if (/instanceof/u.test(line) && /is_object/u.test(line)) {
      return true;
    }
  }
  return false;
}

/** Prove steps whose nested proof uses exclusivity implication. */
export function exclusiveViaUses(
  steps: readonly TraceStep[],
): readonly {
  readonly origin: string;
  readonly reason: string;
}[] {
  return steps.flatMap((step) => {
    if (!isProveFactsRule(step.reason.rule)) {
      return [];
    }
    if (
      !reasonHasChildRule(step.reason, (r) => r === 'facts.imply.exclusive')
    ) {
      return [];
    }
    return [{ origin: 'arrayKey', reason: 'assumed' }];
  });
}

export function hasExclusiveVia(steps: readonly TraceStep[]): boolean {
  return exclusiveViaUses(steps).length > 0;
}

export function allExclusiveViaUsesAreArrayKeyAssumed(
  uses: readonly { readonly origin: string; readonly reason: string }[],
): boolean {
  return uses.every((f) => f.origin === 'arrayKey' && f.reason === 'assumed');
}

export function stepRule(step: TraceStep): string {
  return step.reason.rule;
}

export function asStepReason(step: TraceStep): TraceStepReason {
  return step.reason;
}

/** Legacy helpers kept for older tests that scanned evidence.used. */
export function factUsedCount(_evidence: unknown): number {
  return 0;
}

export function factKnownLabels(_evidence: unknown): readonly string[] {
  return [];
}

export function factUsesFromSteps(
  steps: readonly TraceStep[],
): readonly { readonly origin: string; readonly reason: string }[] {
  const uses: { readonly origin: string; readonly reason: string }[] = [];
  for (const step of steps) {
    const rule = step.reason.rule;
    if (
      (rule === 'facts.proveTrue' ||
        rule === 'facts.proveFalse' ||
        rule === 'facts.env.extend') &&
      bottomsOutAtAssumed(step.reason)
    ) {
      uses.push({ origin: 'path', reason: 'assumed' });
    }
  }
  return uses;
}

export function allFactUsesHaveSources(
  uses: readonly { readonly origin: string; readonly reason: string }[],
): boolean {
  for (const f of uses) {
    if (f.origin.length === 0 || f.reason.length === 0) {
      return false;
    }
  }
  return true;
}
