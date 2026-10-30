import { optimizeTraceRuleInfo } from '../generator/optimizer/trace/rules.ts';
import type {
  OptimizeTraceFactUse,
  OptimizeTraceRuleId,
  TraceStep,
  TraceStepReason,
} from '../generator/optimizer/trace/types.ts';
import { renderTraceRuleHelp } from './metricsHelp.ts';
import {
  renderEventExpr,
  renderEventSnapshot,
  stepTempNames,
} from './optimizeTraceRenderPhp.ts';

/** Env construction / derivation — does not rewrite checker IR. */
export function isEnvTraceRule(rule: OptimizeTraceRuleId): boolean {
  return rule.startsWith('facts.env.');
}

/**
 * Nested proof micro-steps whose focus is premise → conclusion (not a
 * checker rewrite). UI uses Premise / Conclusion / Compare, not Before / After / Diff.
 */
export function isProofRelationRule(rule: OptimizeTraceRuleId): boolean {
  return (
    rule === 'facts.prove.entails' ||
    rule === 'facts.prove.equals' ||
    rule === 'facts.absorb.implies' ||
    rule.startsWith('facts.imply.')
  );
}

/** Every nested step starts collapsed in the step tree. */
export function isCollapsedByDefault(_rule: OptimizeTraceRuleId): boolean {
  return true;
}

function envFactUse(reason: TraceStepReason): OptimizeTraceFactUse | null {
  const evidence = reason.evidence;
  if (evidence?.kind !== 'facts') {
    return null;
  }
  return evidence.used[0] ?? null;
}

function factLinePhp(
  reason: TraceStepReason,
  temps: ReadonlyMap<number, string> | undefined,
): string {
  const use = envFactUse(reason);
  if (use !== null) {
    return renderEventExpr(use.expr, temps).replaceAll('\n', ' ');
  }
  if (reason.focus.after.kind === 'expr') {
    return renderEventExpr(reason.focus.after.expr, temps).replaceAll('\n', ' ');
  }
  return renderEventSnapshot(reason.focus.after, temps).replaceAll('\n', ' ');
}

function appendFactLine(
  parent: HTMLElement,
  reason: TraceStepReason,
  temps: ReadonlyMap<number, string> | undefined,
  helpId: string,
): void {
  const info = optimizeTraceRuleInfo(reason.rule);
  const use = envFactUse(reason);
  const line = document.createElement('div');
  line.className = 'optimize-trace-fact-line';
  const meta = document.createElement('div');
  meta.className = 'optimize-trace-fact-meta';
  if (use !== null) {
    const polarity = document.createElement('span');
    polarity.className = `optimize-trace-fact-known optimize-trace-fact-known--${use.known}`;
    polarity.textContent = use.known;
    meta.append(polarity);
  }
  const source = document.createElement('span');
  source.className = 'optimize-trace-fact-source';
  const sourceText = document.createElement('span');
  sourceText.textContent = info.title;
  const helpWrap = document.createElement('span');
  helpWrap.className = 'optimize-trace-help';
  helpWrap.innerHTML = renderTraceRuleHelp(helpId, info.title, info.help);
  source.append(sourceText, helpWrap);
  meta.append(source);
  const expr = document.createElement('div');
  expr.className = 'optimize-trace-meta-body';
  expr.textContent = factLinePhp(reason, temps);
  line.append(meta, expr);
  parent.append(line);
}

function factCopyLine(
  reason: TraceStepReason,
  temps: ReadonlyMap<number, string> | undefined,
): string {
  const title = optimizeTraceRuleInfo(reason.rule).title;
  const php = factLinePhp(reason, temps);
  const use = envFactUse(reason);
  if (use === null) {
    return `${title}: ${php}`;
  }
  return `${use.known}: ${title}: ${php}`;
}

/** Detail body for nested env fact steps (provenance under prove/absorb). */
export function renderEnvFactsPane(
  step: TraceStep,
  reason: TraceStepReason,
): { readonly el: HTMLElement; readonly copyText: string } {
  const temps = stepTempNames(step);
  const pane = document.createElement('div');
  pane.className = 'optimize-trace-env-facts';
  pane.setAttribute('aria-label', 'Fact provenance');

  const heading = document.createElement('div');
  heading.className = 'optimize-trace-env-facts-heading';
  heading.textContent = 'Fact';
  pane.append(heading);

  appendFactLine(pane, reason, temps, `optimize-trace-env-${step.index}-self`);
  return { el: pane, copyText: factCopyLine(reason, temps) };
}
