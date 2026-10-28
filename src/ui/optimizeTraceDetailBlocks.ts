import {
  factSourceHelp,
  factSourceShort,
} from '../generator/optimizer/passes/facts/factSource.ts';
import type {
  OptimizeTraceFactUse,
  TraceStep,
  TraceStepReason,
} from '../generator/optimizer/trace/types.ts';
import { renderTraceRuleHelp } from './metricsHelp.ts';
import { wrapTraceFold } from './optimizeTraceFold.ts';
import {
  renderEventExpr,
  stepTempNames,
} from './optimizeTraceRenderPhp.ts';

function oneLineExpr(
  expr: OptimizeTraceFactUse['expr'],
  tempNames: ReadonlyMap<number, string> | undefined,
): string {
  return renderEventExpr(expr, tempNames).replaceAll('\n', ' ');
}

function appendFactLines(
  parent: HTMLElement,
  stepIndex: number,
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
    const sourceLabel = factSourceShort(fact.origin, fact.reason);
    const sourceText = document.createElement('span');
    sourceText.textContent = sourceLabel;
    const helpWrap = document.createElement('span');
    helpWrap.className = 'optimize-trace-help';
    helpWrap.innerHTML = renderTraceRuleHelp(
      `optimize-trace-fact-${stepIndex}-${i}`,
      sourceLabel,
      factSourceHelp(fact.origin, fact.reason),
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
  stepIndex: number,
  used: readonly OptimizeTraceFactUse[],
  tempNames: ReadonlyMap<number, string> | undefined,
): HTMLElement | null {
  if (used.length === 0) {
    return null;
  }
  return wrapTraceFold('Used Facts', used.length, 'optimize-trace-facts', (body) => {
    appendFactLines(body, stepIndex, used, tempNames);
  });
}

export function renderEvidenceBlocks(
  step: TraceStep,
  reason: TraceStepReason,
): HTMLElement | null {
  const evidence = reason.evidence;
  if (evidence === undefined) {
    return null;
  }
  const tempNames = stepTempNames(step);
  switch (evidence.kind) {
    case 'facts':
      return renderUsedFactsFold(step.index, evidence.used, tempNames);
    case 'inline':
      return wrapTraceFold('Inline', 1, 'optimize-trace-focus', (body) => {
        const line = document.createElement('div');
        line.className = 'optimize-trace-meta-line';
        line.textContent = evidence.callee;
        body.append(line);
      });
    case 'prune':
      return wrapTraceFold('Removed', 1, 'optimize-trace-focus', (body) => {
        const line = document.createElement('div');
        line.className = 'optimize-trace-meta-line';
        line.textContent = evidence.removed;
        body.append(line);
      });
    default:
      throw new Error('never reached');
  }
}
