import {
  factSourceHelp,
  factSourceShort,
} from '../generator/optimizer/passes/facts/factSource.ts';
import { optimizeTraceRuleInfo } from '../generator/optimizer/trace/rules.ts';
import { renderTraceSnapshot } from '../generator/optimizer/trace/render.ts';
import type { OptimizeTraceEvent } from '../generator/optimizer/trace/types.ts';
import { renderTraceRuleHelp } from './metricsHelp.ts';

export function renderFactsBlock(event: OptimizeTraceEvent): HTMLElement | null {
  if (event.detail.kind !== 'facts' || event.detail.used.length === 0) {
    return null;
  }
  const block = document.createElement('div');
  block.className = 'optimize-trace-facts';
  const heading = document.createElement('div');
  heading.className = 'optimize-trace-meta-label';
  heading.textContent = 'used facts';
  block.append(heading);
  for (const [i, fact] of event.detail.used.entries()) {
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
    expr.textContent = renderTraceSnapshot({ kind: 'expr', expr: fact.expr });
    line.append(polarity, source, expr);
    block.append(line);
  }
  return block;
}

export function renderNestedBlock(
  event: OptimizeTraceEvent,
): HTMLElement | null {
  if (event.detail.kind !== 'nested' || event.detail.steps.length === 0) {
    return null;
  }
  const block = document.createElement('div');
  block.className = 'optimize-trace-nested';
  const heading = document.createElement('div');
  heading.className = 'optimize-trace-meta-label';
  heading.textContent = 'nested steps';
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
    php.textContent = renderTraceSnapshot({
      kind: 'expr',
      expr: step.after,
    }).replaceAll('\n', ' ');
    line.append(title, helpWrap, php);
    block.append(line);
  }
  return block;
}
