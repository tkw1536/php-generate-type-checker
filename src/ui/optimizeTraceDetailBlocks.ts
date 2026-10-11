import {
  factSourceHelp,
  factSourceShort,
} from '../generator/optimizer/passes/facts/factSource.ts';
import { optimizeTraceRuleInfo } from '../generator/optimizer/trace/rules.ts';
import type {
  OptimizeTraceEvent,
  OptimizeTraceFactUse,
} from '../generator/optimizer/trace/types.ts';
import { renderTraceRuleHelp } from './metricsHelp.ts';
import {
  eventTempNames,
  renderEventExpr,
} from './optimizeTraceRenderPhp.ts';

function oneLineExpr(
  expr: OptimizeTraceFactUse['expr'],
  tempNames: ReadonlyMap<number, string> | undefined,
): string {
  return renderEventExpr(expr, tempNames).replaceAll('\n', ' ');
}

function appendUsedFacts(
  parent: HTMLElement,
  event: OptimizeTraceEvent,
  used: readonly OptimizeTraceFactUse[],
  tempNames: ReadonlyMap<number, string> | undefined,
): void {
  if (used.length === 0) {
    return;
  }
  const block = document.createElement('div');
  block.className = 'optimize-trace-facts';
  const heading = document.createElement('div');
  heading.className = 'optimize-trace-meta-label';
  heading.textContent = 'used facts';
  block.append(heading);
  for (const [i, fact] of used.entries()) {
    const line = document.createElement('div');
    line.className = 'optimize-trace-fact-line';
    const polarity = document.createElement('span');
    polarity.className = `optimize-trace-fact-known optimize-trace-fact-known--${fact.known}`;
    polarity.textContent = fact.known;
    const source = document.createElement('span');
    source.className = 'optimize-trace-fact-source';
    const sourceLabel = factSourceShort(fact.origin, fact.reason);
    const sourceText = document.createElement('span');
    sourceText.textContent = sourceLabel;
    const helpWrap = document.createElement('span');
    helpWrap.className = 'optimize-trace-help';
    helpWrap.innerHTML = renderTraceRuleHelp(
      `optimize-trace-fact-${event.index}-${i}`,
      sourceLabel,
      factSourceHelp(fact.origin, fact.reason),
    );
    source.append(sourceText, helpWrap);
    const expr = document.createElement('span');
    expr.className = 'optimize-trace-meta-body';
    expr.textContent = oneLineExpr(fact.expr, tempNames);
    line.append(polarity, source, expr);
    block.append(line);
  }
  parent.append(block);
}

export function renderFactsBlock(event: OptimizeTraceEvent): HTMLElement | null {
  if (event.detail.kind !== 'facts' || event.detail.used.length === 0) {
    return null;
  }
  const wrap = document.createElement('div');
  appendUsedFacts(wrap, event, event.detail.used, eventTempNames(event));
  return wrap.firstElementChild instanceof HTMLElement
    ? wrap.firstElementChild
    : null;
}

export function renderAbsorbBlocks(
  event: OptimizeTraceEvent,
): HTMLElement | null {
  if (event.detail.kind !== 'absorb') {
    return null;
  }
  const tempNames = eventTempNames(event);
  const wrap = document.createElement('div');
  wrap.className = 'optimize-trace-absorb';

  const implBlock = document.createElement('div');
  implBlock.className = 'optimize-trace-implications';
  const heading = document.createElement('div');
  heading.className = 'optimize-trace-meta-label';
  heading.textContent = 'used implications';
  implBlock.append(heading);
  for (const [i, impl] of event.detail.implications.entries()) {
    const line = document.createElement('div');
    line.className = 'optimize-trace-implication-line';
    const body = document.createElement('span');
    body.className = 'optimize-trace-meta-body';
    body.textContent = `${oneLineExpr(impl.from, tempNames)} ⇒ ${oneLineExpr(impl.to, tempNames)}`;
    const helpWrap = document.createElement('span');
    helpWrap.className = 'optimize-trace-help';
    const help =
      event.detail.used.length > 0
        ? 'Operand dropped because this implication holds (path facts below may justify it).'
        : 'Operand dropped because this implication holds structurally (no path fact required).';
    helpWrap.innerHTML = renderTraceRuleHelp(
      `optimize-trace-impl-${event.index}-${i}`,
      'implication',
      help,
    );
    line.append(body, helpWrap);
    implBlock.append(line);
  }
  wrap.append(implBlock);
  appendUsedFacts(wrap, event, event.detail.used, tempNames);
  return wrap;
}

export function renderNestedBlock(
  event: OptimizeTraceEvent,
): HTMLElement | null {
  if (event.detail.kind !== 'nested' || event.detail.steps.length === 0) {
    return null;
  }
  const tempNames = eventTempNames(event);
  const block = document.createElement('div');
  block.className = 'optimize-trace-nested';
  const heading = document.createElement('div');
  heading.className = 'optimize-trace-meta-label';
  heading.textContent = 'cleanup in this step';
  block.append(heading);
  for (const [i, step] of event.detail.steps.entries()) {
    const info = optimizeTraceRuleInfo(step.rule);
    const line = document.createElement('div');
    line.className = 'optimize-trace-nested-line';
    const title = document.createElement('span');
    title.className = 'optimize-trace-nested-title';
    title.textContent = info.title;
    const helpWrap = document.createElement('span');
    helpWrap.className = 'optimize-trace-help';
    helpWrap.innerHTML = renderTraceRuleHelp(
      `optimize-trace-nested-${event.index}-${i}`,
      info.title,
      info.help,
    );
    const php = document.createElement('span');
    php.className = 'optimize-trace-meta-body';
    const before = oneLineExpr(step.before, tempNames);
    const after = oneLineExpr(step.after, tempNames);
    php.textContent = `${before} → ${after}`;
    line.append(title, helpWrap, php);
    block.append(line);
  }
  return block;
}
