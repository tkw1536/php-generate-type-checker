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
import { wrapTraceFold } from './optimizeTraceFold.ts';
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

function appendFactLines(
  parent: HTMLElement,
  event: OptimizeTraceEvent,
  used: readonly OptimizeTraceFactUse[],
  tempNames: ReadonlyMap<number, string> | undefined,
): void {
  for (const [i, fact] of used.entries()) {
    const line = document.createElement('div');
    line.className = 'optimize-trace-fact-line';
    const meta = document.createElement('div');
    meta.className = 'optimize-trace-fact-meta';
    const polarity = document.createElement('span');
    polarity.className = `optimize-trace-fact-known optimize-trace-fact-known--${fact.known}`;
    polarity.textContent = fact.known;
    const source = document.createElement('span');
    source.className = 'optimize-trace-fact-source';
    const sourceLabel = factSourceShort(
      fact.origin,
      fact.reason,
      fact.via,
    );
    const sourceText = document.createElement('span');
    sourceText.textContent = sourceLabel;
    const helpWrap = document.createElement('span');
    helpWrap.className = 'optimize-trace-help';
    helpWrap.innerHTML = renderTraceRuleHelp(
      `optimize-trace-fact-${event.index}-${i}`,
      sourceLabel,
      factSourceHelp(fact.origin, fact.reason, fact.via),
    );
    source.append(sourceText, helpWrap);
    meta.append(polarity, source);
    const expr = document.createElement('div');
    expr.className = 'optimize-trace-meta-body';
    expr.textContent = oneLineExpr(fact.expr, tempNames);
    line.append(meta, expr);
    parent.append(line);
  }
}

function renderUsedFactsFold(
  event: OptimizeTraceEvent,
  used: readonly OptimizeTraceFactUse[],
  tempNames: ReadonlyMap<number, string> | undefined,
): HTMLElement | null {
  if (used.length === 0) {
    return null;
  }
  return wrapTraceFold('Used Facts', used.length, 'optimize-trace-facts', (body) => {
    appendFactLines(body, event, used, tempNames);
  });
}

export function renderFactsBlock(event: OptimizeTraceEvent): HTMLElement | null {
  if (event.detail.kind !== 'facts' || event.detail.used.length === 0) {
    return null;
  }
  return renderUsedFactsFold(
    event,
    event.detail.used,
    eventTempNames(event),
  );
}

export function renderAbsorbBlocks(
  event: OptimizeTraceEvent,
): HTMLElement | null {
  if (event.detail.kind !== 'absorb') {
    return null;
  }
  const { used, implications } = event.detail;
  const tempNames = eventTempNames(event);
  const wrap = document.createElement('div');
  wrap.className = 'optimize-trace-absorb';

  const facts = renderUsedFactsFold(event, used, tempNames);
  if (facts !== null) {
    wrap.append(facts);
  }

  if (implications.length > 0) {
    const hasUsedFacts = used.length > 0;
    wrap.append(
      wrapTraceFold(
        'Used Implications',
        implications.length,
        'optimize-trace-implications',
        (body) => {
          for (const [i, impl] of implications.entries()) {
            const line = document.createElement('div');
            line.className = 'optimize-trace-implication-line';
            const expr = document.createElement('span');
            expr.className = 'optimize-trace-meta-body';
            expr.textContent = `${oneLineExpr(impl.from, tempNames)} ⇒ ${oneLineExpr(impl.to, tempNames)}`;
            const helpWrap = document.createElement('span');
            helpWrap.className = 'optimize-trace-help';
            const help = hasUsedFacts
              ? 'Operand dropped because this implication holds (used facts above may justify it).'
              : 'Operand dropped because this implication holds structurally (no path fact required).';
            helpWrap.innerHTML = renderTraceRuleHelp(
              `optimize-trace-impl-${event.index}-${i}`,
              'implication',
              help,
            );
            line.append(expr, helpWrap);
            body.append(line);
          }
        },
      ),
    );
  }

  return wrap.childElementCount > 0 ? wrap : null;
}

export function renderNestedBlock(
  event: OptimizeTraceEvent,
): HTMLElement | null {
  if (event.detail.kind !== 'nested' || event.detail.steps.length === 0) {
    return null;
  }
  const { steps } = event.detail;
  const tempNames = eventTempNames(event);
  return wrapTraceFold(
    'Cleanup in This Step',
    steps.length,
    'optimize-trace-nested',
    (body) => {
      for (const [i, step] of steps.entries()) {
        const info = optimizeTraceRuleInfo(step.rule);
        const line = document.createElement('div');
        line.className = 'optimize-trace-nested-line';
        const meta = document.createElement('div');
        meta.className = 'optimize-trace-nested-meta';
        const title = document.createElement('span');
        title.className = 'optimize-trace-nested-title';
        const titleText = document.createElement('span');
        titleText.textContent = info.title;
        const helpWrap = document.createElement('span');
        helpWrap.className = 'optimize-trace-help';
        helpWrap.innerHTML = renderTraceRuleHelp(
          `optimize-trace-nested-${event.index}-${i}`,
          info.title,
          info.help,
        );
        title.append(titleText, helpWrap);
        meta.append(title);
        const php = document.createElement('div');
        php.className = 'optimize-trace-meta-body';
        const before = oneLineExpr(step.before, tempNames);
        const after = oneLineExpr(step.after, tempNames);
        php.textContent = `${before} → ${after}`;
        line.append(meta, php);
        body.append(line);
      }
    },
  );
}
