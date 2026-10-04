import { renderLabeledHelp } from './metricsHelp.ts';

/** Wall times for the four high-level pipeline stages (UI measurement). */
export type StageTimings = {
  readonly parseMs: number;
  readonly generateMs: number;
  readonly optimizeMs: number;
  readonly renderMs: number;
  readonly optimizeRan: boolean;
};

function integerDigitWidth(ms: number): number {
  const [integer = '0'] = Math.abs(ms).toFixed(2).split('.');
  return integer.length;
}

export function formatStageMs(ms: number, integerWidth = integerDigitWidth(ms)): string {
  const [integer = '0', fraction = '00'] = ms.toFixed(2).split('.');
  return `${integer.padStart(integerWidth, '0')}.${fraction} ms`;
}

function stageMsValues(timings: StageTimings): readonly number[] {
  const values = [
    timings.parseMs,
    timings.generateMs,
    timings.renderMs,
    stageTimingsTotalMs(timings),
  ];
  if (timings.optimizeRan) {
    return [...values, timings.optimizeMs];
  }
  return values;
}

function integerWidthForTimings(timings: StageTimings): number {
  return Math.max(...stageMsValues(timings).map((ms) => integerDigitWidth(ms)));
}

function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

type StageBox = {
  readonly id: string;
  readonly label: string;
  readonly helpId: string;
  readonly help: string;
  readonly detail: string;
  readonly skipped: boolean;
};

function stageBoxes(timings: StageTimings, integerWidth: number): readonly StageBox[] {
  return [
    {
      id: 'parse',
      label: 'Parse',
      helpId: 'help-stage-parse',
      help: 'Parse the PHPDoc / type input into type ASTs.',
      detail: formatStageMs(timings.parseMs, integerWidth),
      skipped: false,
    },
    {
      id: 'generate',
      label: 'Generate',
      helpId: 'help-stage-generate',
      help: 'Build the naïve checker IR from the parsed ASTs.',
      detail: formatStageMs(timings.generateMs, integerWidth),
      skipped: false,
    },
    {
      id: 'optimize',
      label: 'Optimize',
      helpId: 'help-stage-optimize',
      help: 'Rewrite IR until stable (inline, simplify, DCE, and related passes). Skipped when Optimize is off.',
      detail: timings.optimizeRan
        ? formatStageMs(timings.optimizeMs, integerWidth)
        : 'skipped',
      skipped: !timings.optimizeRan,
    },
    {
      id: 'render',
      label: 'Render',
      helpId: 'help-stage-render',
      help: 'Emit formatted PHP from the final IR.',
      detail: formatStageMs(timings.renderMs, integerWidth),
      skipped: false,
    },
  ];
}

export function stageTimingsTotalMs(timings: StageTimings): number {
  return (
    timings.parseMs +
    timings.generateMs +
    (timings.optimizeRan ? timings.optimizeMs : 0) +
    timings.renderMs
  );
}

function renderStageBox(box: StageBox): string {
  const skippedClass = box.skipped ? ' stages-diagram-box--skipped' : '';
  return `<div class="stages-diagram-box${skippedClass}" data-stage="${box.id}">
  ${renderLabeledHelp(box.label, box.helpId, box.help, 'stages-diagram-label')}
  <span class="stages-diagram-time">${escapeHtml(box.detail)}</span>
</div>`;
}

/** SVG stage connector — same geometry with Optimize on or off. */
function renderArrow(): string {
  return `<span class="stages-diagram-arrow" aria-hidden="true">
  <svg
    class="stages-diagram-arrow-svg"
    viewBox="0 0 28 12"
    width="28"
    height="12"
    focusable="false"
  >
    <path d="M1 6 H20" />
    <path d="M16 1.5 L26 6 L16 10.5 Z" />
  </svg>
</span>`;
}

/**
 * Stages on the shared metrics-pipeline grid (Parse/Generate left,
 * Optimize over diamonds, Render trail). Used for both optimize on/off.
 */
export function renderStagesPipelineHeader(timings: StageTimings): string {
  const integerWidth = integerWidthForTimings(timings);
  const [parse, generate, optimize, render] = stageBoxes(timings, integerWidth);
  if (
    parse === undefined ||
    generate === undefined ||
    optimize === undefined ||
    render === undefined
  ) {
    throw new Error('never reached');
  }
  const total = formatStageMs(stageTimingsTotalMs(timings), integerWidth);
  return `<div class="metrics-stages-header" role="group" aria-label="Pipeline stage timings">
  <div class="metrics-stages-lead">
    ${renderStageBox(parse)}
    ${renderArrow()}
    ${renderStageBox(generate)}
    ${renderArrow()}
  </div>
  <div class="metrics-stages-optimize">
    ${renderStageBox(optimize)}
  </div>
  <div class="metrics-stages-trail">
    ${renderArrow()}
    ${renderStageBox(render)}
    <span class="stages-diagram-total">Total ${escapeHtml(total)}</span>
  </div>
</div>`;
}

/** Stages diagram wrapper (same header layout as Metrics with Optimize off). */
export function renderStagesDiagram(timings: StageTimings): string {
  return `<div class="stages-diagram" role="group" aria-label="Pipeline stage timings">
  ${renderStagesPipelineHeader(timings)}
</div>`;
}

export function stageTimingsCopyText(timings: StageTimings): string {
  const integerWidth = integerWidthForTimings(timings);
  const lines = [
    `Parse\t${formatStageMs(timings.parseMs, integerWidth)}`,
    `Generate\t${formatStageMs(timings.generateMs, integerWidth)}`,
    `Optimize\t${timings.optimizeRan ? formatStageMs(timings.optimizeMs, integerWidth) : 'skipped'}`,
    `Render\t${formatStageMs(timings.renderMs, integerWidth)}`,
    `Total\t${formatStageMs(stageTimingsTotalMs(timings), integerWidth)}`,
  ];
  return lines.join('\n');
}
