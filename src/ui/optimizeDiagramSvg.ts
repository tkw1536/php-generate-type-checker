import {
  DIAMOND,
  OUTER_CX,
  OUTER_CY,
  LEFT_PASS_COUNT,
  RIGHT_PASS_COUNT,
  PASS_X,
  PASS_Y0,
  BOX_H,
  LEFT_BOX_W,
  PRUNE_W,
  PRUNE_X,
  PRUNE_RETURN_Y,
  EDGE_TIP,
  diamondPoints,
  leftPassY,
  rightPassY,
  type DiagramLayout,
} from './optimizeDiagramLayout.ts';

function edge(
  d: string,
  options?: {
    readonly dashed?: boolean;
    readonly arrow?: boolean;
  },
): string {
  const cls =
    options?.dashed === true
      ? 'optimize-diagram-edge optimize-diagram-edge--dashed'
      : 'optimize-diagram-edge';
  const marker = options?.arrow === false ? '' : ' marker-end="url(#opt-arrow)"';
  return `<path class="${cls}" d="${d}"${marker} />`;
}

function renderLeftPassArrows(leftMidX: number): string {
  const parts: string[] = [];
  for (let i = 0; i < LEFT_PASS_COUNT - 1; i++) {
    const y1 = leftPassY(i) + BOX_H;
    const y2 = leftPassY(i + 1);
    parts.push(edge(`M${leftMidX} ${y1 + 2} L${leftMidX} ${y2 - EDGE_TIP}`));
  }
  return parts.join('\n  ');
}

function renderRightPassArrows(
  rightMidX: number,
  innerCy: number,
  innerBottom: number,
): string {
  const parts: string[] = [];
  // Facts → Simplify → DCE (bottom → top); tip sits in the gap under the upper box
  for (let i = RIGHT_PASS_COUNT - 1; i > 0; i--) {
    const fromTop = rightPassY(i, innerCy);
    const toBottom = rightPassY(i - 1, innerCy) + BOX_H;
    parts.push(
      edge(`M${rightMidX} ${fromTop - 2} L${rightMidX} ${toBottom + EDGE_TIP}`),
    );
  }
  // DCE → Inner bottom tip (stop short so the head isn't under the diamond)
  const dceTop = rightPassY(0, innerCy);
  parts.push(
    edge(
      `M${rightMidX} ${dceTop - 2} L${rightMidX} ${innerBottom + EDGE_TIP}`,
    ),
  );
  return parts.join('\n  ');
}

function renderOptimizeEdges(layout: DiagramLayout): string {
  const { innerCy, leftMidX, rightMidX, factsBottom } = layout;
  const outerLeft = OUTER_CX - DIAMOND / 2;
  const outerRight = OUTER_CX + DIAMOND / 2;
  const outerBottom = OUTER_CY + DIAMOND / 2;
  const innerLeft = OUTER_CX - DIAMOND / 2;
  const innerTop = innerCy - DIAMOND / 2;
  const innerBottom = innerCy + DIAMOND / 2;
  const pruneY = OUTER_CY - BOX_H / 2;
  const inlineRight = PASS_X + LEFT_BOX_W;
  const flattenMidY = leftPassY(LEFT_PASS_COUNT - 1) + BOX_H / 2;
  const flattenRight = PASS_X + LEFT_BOX_W;
  const entryX = OUTER_CX - 12;
  const returnX = OUTER_CX + 12;
  // Same x / y as the IR "Yes × N" pill (see optimizeDiagram annotations).
  const yesJoinX = (outerLeft + leftMidX) / 2;
  const yesPillBottom = OUTER_CY - 18 + 8;

  return `${edge(`M${entryX} 0 L${entryX} ${PRUNE_RETURN_Y} L${yesJoinX} ${PRUNE_RETURN_Y} L${yesJoinX} ${yesPillBottom}`, { dashed: true, arrow: false })}
  ${edge(`M${yesJoinX} ${yesPillBottom} L${yesJoinX} ${OUTER_CY}`, { arrow: false })}
  ${edge(`M${outerLeft} ${OUTER_CY} L${leftMidX} ${OUTER_CY} L${leftMidX} ${PASS_Y0 - EDGE_TIP}`)}
  ${edge(`M${outerRight} ${OUTER_CY} L${PRUNE_X - EDGE_TIP} ${OUTER_CY}`)}
  ${edge(`M${PRUNE_X + PRUNE_W / 2} ${pruneY} L${PRUNE_X + PRUNE_W / 2} ${PRUNE_RETURN_Y} L${returnX} ${PRUNE_RETURN_Y} L${returnX} ${EDGE_TIP}`, { dashed: true })}
  ${renderLeftPassArrows(leftMidX)}
  ${edge(`M${flattenRight} ${flattenMidY} L${rightMidX} ${flattenMidY} L${rightMidX} ${factsBottom + EDGE_TIP}`)}
  ${renderRightPassArrows(rightMidX, innerCy, innerBottom)}
  ${edge(`M${innerLeft} ${innerCy} L${inlineRight + EDGE_TIP} ${innerCy}`)}
  ${edge(`M${OUTER_CX} ${innerTop} L${OUTER_CX} ${outerBottom + EDGE_TIP}`)}`;
}

/** Edges + diamond polygons for the optimize flowchart. */
export function renderOptimizeSvg(layout: DiagramLayout): string {
  const { width, height, innerCy } = layout;
  return `<svg
  class="optimize-diagram-svg"
  viewBox="0 0 ${width} ${height}"
  width="${width}"
  height="${height}"
  aria-hidden="true"
  focusable="false"
>
  <defs>
    <marker
      id="opt-arrow"
      viewBox="0 0 10 10"
      refX="9"
      refY="5"
      markerWidth="8"
      markerHeight="8"
      markerUnits="userSpaceOnUse"
      orient="auto"
    >
      <path d="M0 0 L10 5 L0 10 Z" />
    </marker>
  </defs>
  <polygon class="optimize-diagram-diamond-shape" points="${diamondPoints(OUTER_CX, OUTER_CY, DIAMOND)}" />
  <polygon class="optimize-diagram-diamond-shape" points="${diamondPoints(OUTER_CX, innerCy, DIAMOND)}" />
  ${renderOptimizeEdges(layout)}
</svg>`;
}
