import type { OptimizerStats } from '../generator/optimizer/stats/types.ts';
import { renderLabeledHelp, renderMetricsHelp } from './metricsHelp.ts';
import {
  ARROW_HEAD,
  BOX_H,
  DIAMOND,
  EDGE_TIP,
  LEFT_BOX_W,
  LEFT_PASS_COUNT,
  OUTER_CX,
  OUTER_CY,
  PASS_X,
  PRUNE_W,
  PRUNE_X,
  RIGHT_BOX_W,
  RIGHT_X,
  createLayout,
  leftPassY,
  rightPassY,
  type DiagramLayout,
} from './optimizeDiagramLayout.ts';
import {
  INNER_DECISION_HELP,
  INNER_HELP,
  LEFT_PASS_BOXES,
  OUTER_DECISION_HELP,
  OUTER_HELP,
  PRUNE_HELP,
  RIGHT_PASS_BOXES,
  formatChanged,
  passDetail,
  toPassBox,
  type PassBox,
} from './optimizeDiagramPasses.ts';
import { renderOptimizeSvg } from './optimizeDiagramSvg.ts';

function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function renderPassNode(
  box: PassBox,
  detail: string,
  x: number,
  y: number,
  width: number,
): string {
  return `<div
  class="optimize-diagram-node optimize-diagram-box"
  data-pass="${box.id}"
  style="left:${x}px;top:${y}px;width:${width}px;height:${BOX_H}px"
>
  ${renderLabeledHelp(box.label, box.helpId, box.help, 'optimize-diagram-label')}
  <span class="optimize-diagram-detail">${escapeHtml(detail)}</span>
</div>`;
}

function renderDecisionNode(options: {
  readonly kind: 'outer' | 'inner';
  readonly title: string;
  readonly cx: number;
  readonly cy: number;
  readonly helpId: string;
  readonly helpLabel: string;
  readonly help: string;
}): string {
  const x = options.cx - DIAMOND / 2;
  const y = options.cy - DIAMOND / 2;
  return `<div
  class="optimize-diagram-node optimize-diagram-decision"
  data-decision="${options.kind}"
  style="left:${x}px;top:${y}px;width:${DIAMOND}px;height:${DIAMOND}px"
>
  <span class="optimize-diagram-decision-q">
    <span class="optimize-diagram-decision-title">${escapeHtml(options.title)}</span>
    <span>changed?</span>
    ${renderMetricsHelp(options.helpId, options.helpLabel, options.help)}
  </span>
</div>`;
}

function renderEdgeLabel(text: string, x: number, y: number): string {
  return `<span
  class="optimize-diagram-node optimize-diagram-edge-label"
  style="left:${x}px;top:${y}px"
  aria-hidden="true"
>${escapeHtml(text)}</span>`;
}

/** Yes loop annotation: "Yes × N" plus the fixpoint (i) help. */
function renderYesLoopLabel(options: {
  readonly count: number;
  readonly x: number;
  readonly y: number;
  readonly helpId: string;
  readonly helpLabel: string;
  readonly help: string;
}): string {
  return `<div
  class="optimize-diagram-node optimize-diagram-yes-loop"
  style="left:${options.x}px;top:${options.y}px"
  aria-label="${escapeHtml(options.helpLabel)}: ${options.count}"
>
  <span>Yes × ${options.count}</span>
  ${renderMetricsHelp(options.helpId, options.helpLabel, options.help)}
</div>`;
}

function renderPassNodes(stats: OptimizerStats, layout: DiagramLayout): string {
  const left = LEFT_PASS_BOXES.map((meta, index) => {
    const box = toPassBox(meta, stats.passes[meta.id]);
    return renderPassNode(
      box,
      passDetail(box, stats),
      PASS_X,
      leftPassY(index),
      LEFT_BOX_W,
    );
  });
  if (left.length !== LEFT_PASS_COUNT) {
    throw new Error('never reached');
  }
  const right = RIGHT_PASS_BOXES.map((meta, index) => {
    const box = toPassBox(meta, stats.passes[meta.id]);
    return renderPassNode(
      box,
      passDetail(box, stats),
      RIGHT_X,
      rightPassY(index, layout.innerCy),
      RIGHT_BOX_W,
    );
  });
  return [...left, ...right].join('\n');
}

function renderDecisionNodes(layout: DiagramLayout): string {
  return `${renderDecisionNode({
  kind: 'outer',
  title: 'IR',
  cx: OUTER_CX,
  cy: OUTER_CY,
  helpId: 'help-pass-outer-decision',
  helpLabel: 'IR changed?',
  help: OUTER_DECISION_HELP,
})}
${renderDecisionNode({
  kind: 'inner',
  title: 'Block',
  cx: OUTER_CX,
  cy: layout.innerCy,
  helpId: 'help-pass-inner-decision',
  helpLabel: 'Block changed?',
  help: INNER_DECISION_HELP,
})}`;
}

function renderAnnotations(stats: OptimizerStats, layout: DiagramLayout): string {
  const { innerCy } = layout;
  const innerLeft = OUTER_CX - DIAMOND / 2;
  const inlineRight = PASS_X + LEFT_BOX_W;
  const outerYesX = (OUTER_CX - DIAMOND / 2 + PASS_X + LEFT_BOX_W / 2) / 2;
  // Midpoint of the yes stroke only (tip at Inline; exclude arrowhead).
  const yesTipX = inlineRight + EDGE_TIP;
  const yesShaftEndX = yesTipX + ARROW_HEAD;
  const innerYesX = (yesShaftEndX + innerLeft) / 2;
  // Midpoint of the Inner→Outer no stroke (exclude arrowhead at Outer).
  const outerBottom = OUTER_CY + DIAMOND / 2;
  const innerTop = innerCy - DIAMOND / 2;
  const noTipY = outerBottom + EDGE_TIP;
  const noShaftEndY = noTipY + ARROW_HEAD;
  const innerNoY = (innerTop + noShaftEndY) / 2;
  return `${renderYesLoopLabel({
  count: stats.outerOptimizeLoops,
  x: outerYesX,
  y: OUTER_CY - 18,
  helpId: 'help-pass-outer-loops',
  helpLabel: 'IR rounds',
  help: OUTER_HELP,
})}
${renderYesLoopLabel({
  count: stats.blockOptimizeLoops,
  x: innerYesX,
  y: innerCy - 14,
  helpId: 'help-pass-inner-loops',
  helpLabel: 'Block rounds',
  help: INNER_HELP,
})}
${renderEdgeLabel('no', OUTER_CX + DIAMOND / 2 + 18, OUTER_CY - 12)}
${renderEdgeLabel('no', OUTER_CX + 14, innerNoY)}`;
}

function renderNodes(stats: OptimizerStats, layout: DiagramLayout): string {
  const prune = stats.passes.prune;
  return `${renderPassNodes(stats, layout)}
${renderPassNode(
  {
    id: 'prune',
    label: 'Prune unused helpers',
    helpId: 'help-pass-prune',
    help: PRUNE_HELP,
    stats: prune,
  },
  formatChanged(prune),
  PRUNE_X,
  OUTER_CY - BOX_H / 2,
  PRUNE_W,
)}
${renderDecisionNodes(layout)}
${renderAnnotations(stats, layout)}`;
}

/** Fixed-coordinate SVG flowchart under Optimize (sketch layout). */
export function renderOptimizeDiagram(stats: OptimizerStats): string {
  const layout = createLayout();
  return `<div
  class="optimize-diagram"
  role="group"
  aria-label="Optimizer pass flow"
  style="width:${layout.width}px;height:${layout.height}px"
>
  ${renderOptimizeSvg(layout)}
  <div class="optimize-diagram-nodes">
    ${renderNodes(stats, layout)}
  </div>
</div>`;
}
