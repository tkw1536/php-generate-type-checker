/** Fixed layout constants (px) for the Metrics optimize SVG flowchart. */

/** Left column (Inline…Flatten) — short labels. */
export const LEFT_BOX_W = 148;
/** Right column under Inner (DCE/Simplify/Facts) + Prune. */
export const RIGHT_BOX_W = 196;
export const BOX_H = 52;
/** Vertical step between stacked pass boxes (gap ≈ STEP − BOX_H). */
export const STEP = 88;
export const DIAMOND = 104;
export const PASS_X = 16;
/** Centered under the Optimize stage (pass-col 220 + gap + 40 + gap + diamond/2). */
export const OUTER_CX = 324;
/** Extra room on the Optimize → Outer dashed entry. */
export const OUTER_CY = 108;
export const PRUNE_X = OUTER_CX + DIAMOND / 2 + 52;
/** Y of the Prune → Optimize return elbow (below the stage row). */
export const PRUNE_RETURN_Y = 36;
export const PRUNE_W = RIGHT_BOX_W;
/** Gap between Outer bottom tip and Inner top tip (no↑ edge). */
export const OUTER_INNER_GAP = 48;
/**
 * Left pass column top: Inline center aligns with Inner cy, with
 * OUTER_INNER_GAP between the Outer and Inner diamonds.
 */
export const PASS_Y0 = OUTER_CY + DIAMOND + OUTER_INNER_GAP - BOX_H / 2;
/** Left column: Inline → … → Flatten. */
export const LEFT_PASS_COUNT = 5;
/** Right column under Inner (top→bottom draw order): DCE, Simplify, Facts. */
export const RIGHT_PASS_COUNT = 3;
export const RIGHT_X = OUTER_CX - RIGHT_BOX_W / 2;
/** Gap from Inner bottom tip to DCE (top of right stack). */
export const INNER_STACK_GAP = 28;
/** Stop arrow strokes short of HTML boxes / diamond fills. */
export const EDGE_TIP = 6;
/** SVG marker length along the stroke (excluded when centering edge labels). */
export const ARROW_HEAD = 8;

export type DiagramLayout = {
  readonly width: number;
  readonly height: number;
  readonly innerCy: number;
  readonly leftMidX: number;
  readonly rightMidX: number;
  readonly factsBottom: number;
};

export function leftPassY(index: number): number {
  return PASS_Y0 + index * STEP;
}

/** Right stack under Inner: 0 = DCE (top), 1 = Simplify, 2 = Facts (bottom). */
export function rightPassY(index: number, innerCy: number): number {
  return innerCy + DIAMOND / 2 + INNER_STACK_GAP + index * STEP;
}

export function createLayout(): DiagramLayout {
  const innerCy = leftPassY(0) + BOX_H / 2;
  const flattenBottom = leftPassY(LEFT_PASS_COUNT - 1) + BOX_H;
  const factsTop = rightPassY(RIGHT_PASS_COUNT - 1, innerCy);
  const factsBottom = factsTop + BOX_H;
  const height = Math.max(flattenBottom, factsBottom) + 24;
  const width = Math.max(PRUNE_X + PRUNE_W, RIGHT_X + RIGHT_BOX_W) + 16;
  return {
    width,
    height,
    innerCy,
    leftMidX: PASS_X + LEFT_BOX_W / 2,
    rightMidX: RIGHT_X + RIGHT_BOX_W / 2,
    factsBottom,
  };
}

export function diamondPoints(cx: number, cy: number, size: number): string {
  const h = size / 2;
  return `${cx},${cy - h} ${cx + h},${cy} ${cx},${cy + h} ${cx - h},${cy}`;
}
