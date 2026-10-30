/** Viewport margin so tips stay clear of the screen edge. */
export const TOOLTIP_VIEWPORT_MARGIN = 8;
/** Gap between trigger and tip. */
export const TOOLTIP_GAP = 6;
/** Soft max width before viewport clamping (22rem at 16px root). */
export const TOOLTIP_MAX_WIDTH_PX = 22 * 16;

export type RectLike = {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
  readonly width: number;
  readonly height: number;
};

export type TooltipPlacement = {
  readonly top: number;
  readonly left: number;
  readonly maxWidth: number;
  readonly placement: 'above' | 'below';
};

type ViewportSize = {
  readonly width: number;
  readonly height: number;
};

type TipSize = {
  readonly width: number;
  readonly height: number;
};

function tipMaxWidth(viewportWidth: number, softMax: number, margin: number): number {
  return Math.min(softMax, Math.max(0, viewportWidth - 2 * margin));
}

function placeVertical(
  trigger: RectLike,
  tipHeight: number,
  viewport: ViewportSize,
  margin: number,
  gap: number,
): { readonly top: number; readonly placement: 'above' | 'below' } {
  const spaceAbove = trigger.top - margin;
  const spaceBelow = viewport.height - trigger.bottom - margin;
  const preferAbove = spaceAbove >= spaceBelow;
  const need = tipHeight + gap;

  if (preferAbove && need <= spaceAbove) {
    return { placement: 'above', top: trigger.top - gap - tipHeight };
  }
  if (need <= spaceBelow) {
    return { placement: 'below', top: trigger.bottom + gap };
  }
  if (preferAbove) {
    return {
      placement: 'above',
      top: Math.max(margin, trigger.top - gap - tipHeight),
    };
  }
  return {
    placement: 'below',
    top: Math.min(
      viewport.height - margin - tipHeight,
      trigger.bottom + gap,
    ),
  };
}

function placeHorizontal(
  trigger: RectLike,
  tipWidth: number,
  viewportWidth: number,
  margin: number,
): number {
  const centered = trigger.left + trigger.width / 2 - tipWidth / 2;
  const minLeft = margin;
  const maxLeft = viewportWidth - margin - tipWidth;
  if (maxLeft < minLeft) {
    return minLeft;
  }
  return Math.min(Math.max(centered, minLeft), maxLeft);
}

/** Prefer the vertical side with more free space; center horizontally when possible, else clamp. */
export function placeTooltip(
  trigger: RectLike,
  tipSize: TipSize,
  viewport: ViewportSize,
  options: {
    readonly margin?: number;
    readonly gap?: number;
    readonly maxWidth?: number;
  } = {},
): TooltipPlacement {
  const margin = options.margin ?? TOOLTIP_VIEWPORT_MARGIN;
  const gap = options.gap ?? TOOLTIP_GAP;
  const softMax = options.maxWidth ?? TOOLTIP_MAX_WIDTH_PX;
  const maxWidth = tipMaxWidth(viewport.width, softMax, margin);
  const tipWidth = Math.min(tipSize.width, maxWidth);
  const vertical = placeVertical(trigger, tipSize.height, viewport, margin, gap);
  const left = placeHorizontal(trigger, tipWidth, viewport.width, margin);
  return { top: vertical.top, left, maxWidth, placement: vertical.placement };
}

const TRIGGER_SELECTOR = '.option-help, .option-unsound-badge';

function isTooltipTrigger(el: Element): el is HTMLElement {
  return (
    el instanceof HTMLElement &&
    el.matches(TRIGGER_SELECTOR) &&
    typeof el.dataset.tooltip === 'string' &&
    el.dataset.tooltip !== ''
  );
}

function findTrigger(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof Element)) {
    return null;
  }
  const el = target.closest(TRIGGER_SELECTOR);
  if (el === null || !isTooltipTrigger(el)) {
    return null;
  }
  return el;
}

function createTooltipElement(): HTMLElement {
  const tip = document.createElement('div');
  tip.id = 'ui-tooltip';
  tip.className = 'ui-tooltip';
  tip.setAttribute('role', 'tooltip');
  tip.setAttribute('aria-hidden', 'true');
  tip.hidden = true;
  document.body.append(tip);
  return tip;
}

type TooltipController = {
  readonly show: (trigger: HTMLElement) => void;
  readonly hide: () => void;
  readonly reposition: () => void;
  readonly isActive: (el: HTMLElement | null) => boolean;
};

/** Returns false when the trigger has no tooltip text. */
function applyPlacement(tip: HTMLElement, active: HTMLElement): boolean {
  const text = active.dataset.tooltip;
  if (text === undefined || text === '') {
    tip.hidden = true;
    tip.textContent = '';
    return false;
  }

  tip.textContent = text;
  tip.hidden = false;

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  tip.style.maxWidth = `${tipMaxWidth(vw, TOOLTIP_MAX_WIDTH_PX, TOOLTIP_VIEWPORT_MARGIN)}px`;
  tip.style.top = '0';
  tip.style.left = '0';

  const tipRect = tip.getBoundingClientRect();
  const placed = placeTooltip(
    active.getBoundingClientRect(),
    { width: tipRect.width, height: tipRect.height },
    { width: vw, height: vh },
  );

  tip.style.maxWidth = `${placed.maxWidth}px`;
  tip.style.top = `${placed.top}px`;
  tip.style.left = `${placed.left}px`;
  return true;
}

function createTooltipController(tip: HTMLElement): TooltipController {
  let active: HTMLElement | null = null;

  const hide = (): void => {
    active = null;
    tip.hidden = true;
    tip.textContent = '';
  };

  const reposition = (): void => {
    if (active === null) {
      return;
    }
    if (!applyPlacement(tip, active)) {
      active = null;
    }
  };

  const show = (trigger: HTMLElement): void => {
    if (active === trigger) {
      return;
    }
    active = trigger;
    reposition();
  };

  return {
    show,
    hide,
    reposition,
    isActive: (el) => active === el,
  };
}

function onPointerOut(ctrl: TooltipController, event: Event): void {
  if (!(event instanceof PointerEvent)) {
    return;
  }
  const leaving = findTrigger(event.target);
  if (leaving === null || !ctrl.isActive(leaving)) {
    return;
  }
  const related = event.relatedTarget;
  if (related instanceof Node && leaving.contains(related)) {
    return;
  }
  if (findTrigger(related) === leaving) {
    return;
  }
  ctrl.hide();
}

function onFocusOut(ctrl: TooltipController, event: Event): void {
  if (!(event instanceof FocusEvent)) {
    return;
  }
  const leaving = findTrigger(event.target);
  if (leaving === null || !ctrl.isActive(leaving)) {
    return;
  }
  if (findTrigger(event.relatedTarget) === leaving) {
    return;
  }
  ctrl.hide();
}

function bindPointerAndFocus(ctrl: TooltipController): void {
  document.addEventListener(
    'pointerover',
    (event: Event) => {
      const trigger = findTrigger(event.target);
      if (trigger !== null) {
        ctrl.show(trigger);
      }
    },
    true,
  );
  document.addEventListener(
    'pointerout',
    (event: Event) => {
      onPointerOut(ctrl, event);
    },
    true,
  );
  document.addEventListener(
    'focusin',
    (event: Event) => {
      const trigger = findTrigger(event.target);
      if (trigger !== null) {
        ctrl.show(trigger);
      }
    },
    true,
  );
  document.addEventListener(
    'focusout',
    (event: Event) => {
      onFocusOut(ctrl, event);
    },
    true,
  );
}

/** Body-level floating tip for `data-tooltip` help controls (a11y stays on aria-describedby). */
export function setupFloatingTooltips(): void {
  const tip = createTooltipElement();
  const ctrl = createTooltipController(tip);
  bindPointerAndFocus(ctrl);

  window.addEventListener(
    'scroll',
    () => {
      ctrl.reposition();
    },
    true,
  );
  window.addEventListener('resize', () => {
    ctrl.reposition();
  });
}
