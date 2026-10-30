import { describe, expect, it } from 'vitest';
import {
  placeTooltip,
  TOOLTIP_GAP,
  TOOLTIP_VIEWPORT_MARGIN,
} from './tooltips.ts';

const viewport = { width: 1000, height: 800 };
const tip = { width: 200, height: 80 };

function placesAboveWhenMoreSpaceAbove(): void {
  const trigger = {
    top: 600,
    right: 520,
    bottom: 616,
    left: 500,
    width: 20,
    height: 16,
  };
  const placed = placeTooltip(trigger, tip, viewport);
  expect(placed.placement).toBe('above');
  expect(placed.top).toBe(trigger.top - TOOLTIP_GAP - tip.height);
  expect(placed.left).toBe(trigger.left + trigger.width / 2 - tip.width / 2);
}

function placesBelowWhenMoreSpaceBelow(): void {
  const trigger = {
    top: 40,
    right: 520,
    bottom: 56,
    left: 500,
    width: 20,
    height: 16,
  };
  const placed = placeTooltip(trigger, tip, viewport);
  expect(placed.placement).toBe('below');
  expect(placed.top).toBe(trigger.bottom + TOOLTIP_GAP);
}

function clampsVerticallyWhenTipTallerThanBothSides(): void {
  const shortViewport = { width: 1000, height: 200 };
  const trigger = {
    top: 110,
    right: 520,
    bottom: 126,
    left: 500,
    width: 20,
    height: 16,
  };
  const tall = { width: 200, height: 160 };
  const placed = placeTooltip(trigger, tall, shortViewport);
  expect(placed.placement).toBe('above');
  expect(placed.top).toBe(TOOLTIP_VIEWPORT_MARGIN);
}

function clampsHorizontallyNearLeftEdge(): void {
  const trigger = {
    top: 400,
    right: 30,
    bottom: 416,
    left: 10,
    width: 20,
    height: 16,
  };
  const placed = placeTooltip(trigger, tip, viewport);
  expect(placed.left).toBe(TOOLTIP_VIEWPORT_MARGIN);
}

function clampsHorizontallyNearRightEdge(): void {
  const trigger = {
    top: 400,
    right: 990,
    bottom: 416,
    left: 970,
    width: 20,
    height: 16,
  };
  const placed = placeTooltip(trigger, tip, viewport);
  expect(placed.left).toBe(viewport.width - TOOLTIP_VIEWPORT_MARGIN - tip.width);
}

function capsMaxWidthToViewport(): void {
  const narrow = { width: 300, height: 800 };
  const placed = placeTooltip(
    {
      top: 400,
      right: 160,
      bottom: 416,
      left: 140,
      width: 20,
      height: 16,
    },
    { width: 400, height: 40 },
    narrow,
  );
  expect(placed.maxWidth).toBe(narrow.width - 2 * TOOLTIP_VIEWPORT_MARGIN);
  expect(placed.left).toBe(TOOLTIP_VIEWPORT_MARGIN);
}

describe('placeTooltip', () => {
  it('places above when there is more space above', placesAboveWhenMoreSpaceAbove);
  it('places below when there is more space below', placesBelowWhenMoreSpaceBelow);
  it(
    'clamps vertically when the tip is taller than both sides',
    clampsVerticallyWhenTipTallerThanBothSides,
  );
  it('clamps horizontally near the left edge', clampsHorizontallyNearLeftEdge);
  it('clamps horizontally near the right edge', clampsHorizontallyNearRightEdge);
  it('caps maxWidth to the viewport minus margins', capsMaxWidthToViewport);
});
