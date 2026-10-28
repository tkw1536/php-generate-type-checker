import { parseType } from '../../../parser/index.ts';
import { buildMany } from '../../pipeline.ts';
import { optimize } from '../index.ts';
import { renderTraceSnapshot } from './render.ts';
import type { TraceReasoning, TraceStep } from './types.ts';

export function optimizeListUnionSteps(): readonly TraceStep[] {
  const ast = parseType('list<mixed>|list<string>');
  const { ir: built } = buildMany([ast]);
  return optimize(built).steps;
}

export function isNormalizeRule(rule: string): boolean {
  return (
    rule === 'simplify.normalize' || rule.startsWith('simplify.normalize.')
  );
}

export function stepTouchesNormalize(step: TraceStep): boolean {
  if (isNormalizeRule(step.reason.rule)) {
    return true;
  }
  for (const child of step.reason.children) {
    if (child.kind === 'step' && isNormalizeRule(child.rule)) {
      return true;
    }
  }
  return false;
}

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

export function nestedStepsUnderRule(
  steps: readonly TraceStep[],
  parentRulePrefix: string,
): readonly { readonly rule: string }[] {
  return steps.flatMap((step) => walkUnder(step.reason, parentRulePrefix));
}

export function allNestedStepsAreNormalize(
  nested: readonly { readonly rule: string }[],
): boolean {
  for (const s of nested) {
    // Micros under simplify.normalize (or nested further); not the package id itself.
    if (
      !s.rule.startsWith('simplify.normalize.') &&
      !s.rule.startsWith('facts.imply.')
    ) {
      return false;
    }
  }
  return true;
}

export function childStepRules(step: TraceStep): readonly string[] {
  return step.reason.children
    .filter((c) => c.kind === 'step')
    .map((c) => c.rule);
}

export function normalizePackagesHaveMicroChildren(
  steps: readonly TraceStep[],
): boolean {
  const packages = steps.filter((e) => e.reason.rule === 'simplify.normalize');
  if (packages.length === 0) {
    return false;
  }
  for (const p of packages) {
    const micros = childStepRules(p);
    if (micros.length === 0) {
      return false;
    }
    for (const r of micros) {
      if (!r.startsWith('simplify.normalize.')) {
        return false;
      }
    }
  }
  return true;
}

export function noTopLevelNormalizeMicros(
  steps: readonly TraceStep[],
): boolean {
  for (const e of steps) {
    if (e.reason.rule.startsWith('simplify.normalize.')) {
      return false;
    }
  }
  return true;
}

export function packagesNestRule(
  steps: readonly TraceStep[],
  microRule: string,
): boolean {
  for (const e of steps) {
    if (e.reason.rule !== 'simplify.normalize') {
      continue;
    }
    if (childStepRules(e).includes(microRule)) {
      return true;
    }
  }
  return false;
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
