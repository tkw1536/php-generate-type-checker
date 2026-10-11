import { renderTraceSnapshot } from './render.ts';
import type { OptimizeTraceDetail, OptimizeTraceEvent } from './types.ts';

export function factUsedCount(detail: OptimizeTraceDetail): number {
  if (detail.kind === 'facts' || detail.kind === 'absorb') {
    return detail.used.length;
  }
  return 0;
}

export function factKnownLabels(detail: OptimizeTraceDetail): readonly string[] {
  if (detail.kind === 'facts' || detail.kind === 'absorb') {
    return detail.used.map((f) => f.known);
  }
  return [];
}

export function factUsesFromEvents(
  events: readonly OptimizeTraceEvent[],
): readonly { readonly origin: string; readonly reason: string }[] {
  const uses: { readonly origin: string; readonly reason: string }[] = [];
  for (const e of events) {
    if (e.detail.kind !== 'facts' && e.detail.kind !== 'absorb') {
      continue;
    }
    for (const f of e.detail.used) {
      uses.push({ origin: f.origin, reason: f.reason });
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

export function nestedStepsFromEvents(
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

export function allNestedStepsAreNormalize(
  steps: readonly { readonly rule: string }[],
): boolean {
  for (const s of steps) {
    if (!s.rule.startsWith('simplify.normalize.')) {
      return false;
    }
  }
  return true;
}

export function eventExplainsFactsRule(e: OptimizeTraceEvent): boolean {
  if (e.rule === 'facts.absorb') {
    return e.detail.kind === 'absorb' && e.detail.implications.length > 0;
  }
  return e.detail.kind === 'facts' && e.detail.used.length > 0;
}

export function isProveFactsRule(rule: string): boolean {
  return rule === 'facts.proveTrue' || rule === 'facts.proveFalse';
}

export function absorbImplicationPhp(
  events: readonly OptimizeTraceEvent[],
): readonly string[] {
  const lines: string[] = [];
  for (const e of events) {
    if (e.detail.kind !== 'absorb') {
      continue;
    }
    for (const impl of e.detail.implications) {
      lines.push(
        `${renderTraceSnapshot({ kind: 'expr', expr: impl.from })} ⇒ ${renderTraceSnapshot({ kind: 'expr', expr: impl.to })}`,
      );
    }
  }
  return lines;
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
