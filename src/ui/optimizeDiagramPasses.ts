import type {
  OptimizerPassName,
  OptimizerStats,
  PassStats,
} from '../generator/optimizer/statsTypes.ts';

export type PassBox = {
  readonly id: OptimizerPassName;
  readonly label: string;
  readonly helpId: string;
  readonly help: string;
  readonly stats: PassStats;
};

export type PassMeta = {
  readonly id: OptimizerPassName;
  readonly label: string;
  readonly helpId: string;
  readonly help: string;
};

/** Left column: Inline → … → Flatten. */
export const LEFT_PASS_BOXES: readonly PassMeta[] = [
  {
    id: 'inline',
    label: 'Inline helpers',
    helpId: 'help-pass-inline',
    help: 'Substitute non-entry helpers at the call site. Entry @phpstan-type checkers stay as calls.',
  },
  {
    id: 'dedupe',
    label: 'Dedupe',
    helpId: 'help-pass-dedupe',
    help: 'Drop identical repeated if / foreach statements.',
  },
  {
    id: 'unnest',
    label: 'Unnest',
    helpId: 'help-pass-unnest',
    help: 'Collapse nested single-body ifs into one condition (if (a) { if (b) … } → if (a && b) …).',
  },
  {
    id: 'combine',
    label: 'Combine',
    helpId: 'help-pass-combine',
    help: 'Merge consecutive ifs that share the same body into one condition.',
  },
  {
    id: 'flatten',
    label: 'Flatten',
    helpId: 'help-pass-flatten',
    help: 'Turn a trailing if/return pair into one return expression.',
  },
];

/**
 * Right column under Inner (top→bottom): DCE, Simplify, Known facts.
 * Flow is bottom→top into Inner.
 */
export const RIGHT_PASS_BOXES: readonly PassMeta[] = [
  {
    id: 'dce',
    label: 'Dead-code elimination',
    helpId: 'help-pass-dce',
    help: 'Remove unreachable or empty statements (if (FALSE), code after return, empty foreach), drop unused foreach keys, and rewrite foreach { return E } to if (!== []) return E when E ignores loop vars.',
  },
  {
    id: 'simplify',
    label: 'Simplify',
    helpId: 'help-pass-simplify',
    help: 'Fold boolean algebra, contradictions, factoring, and related expression rewrites until a fixpoint.',
  },
  {
    id: 'facts',
    label: 'Known facts',
    helpId: 'help-pass-facts',
    help: 'Replace tests proven true or false by control flow or entailed by known facts. Inside array foreach, keys are int|non-decimal-int-string (impossible key refinements fold away).',
  },
];

export const PRUNE_HELP =
  'Delete helper checkers that nothing calls anymore. Runs once after the IR loop finishes.';

/** Diamond: what “IR changed?” decides. */
export const OUTER_DECISION_HELP =
  'After a full pass over every checker: did any IR program still change? Yes runs Inline→…→DCE again; No continues to Prune.';

/** Diamond: what “Block changed?” decides. */
export const INNER_DECISION_HELP =
  'After Inline→…→DCE on one block: did that block still change? Yes restarts this block at Inline; No moves on (back to IR changed?).';

/** Yes × N on the IR loop: what the number is. */
export const OUTER_HELP =
  'Number of times the IR loop ran, including the last round that made no changes.';

/** Yes × N on the block loop: what the number is. */
export const INNER_HELP =
  'Total number of block-loop rounds across all blocks (each block counts its own rounds).';

export function formatChanged(stats: PassStats): string {
  return stats.changed === 1 ? '1 changed' : `${stats.changed} changed`;
}

export function formatSimplifyDetail(stats: OptimizerStats): string {
  const changed = formatChanged(stats.passes.simplify);
  const { maxPasses, sumPasses } = stats.simplify;
  return `${changed} · max ${maxPasses} · sum ${sumPasses}`;
}

export function toPassBox(box: PassMeta, stats: PassStats): PassBox {
  return {
    id: box.id,
    label: box.label,
    helpId: box.helpId,
    help: box.help,
    stats,
  };
}

export function allPassBoxes(stats: OptimizerStats): readonly PassBox[] {
  return [
    ...LEFT_PASS_BOXES.map((box) => toPassBox(box, stats.passes[box.id])),
    ...RIGHT_PASS_BOXES.map((box) => toPassBox(box, stats.passes[box.id])),
  ];
}

export function passDetail(box: PassBox, stats: OptimizerStats): string {
  return box.id === 'simplify'
    ? formatSimplifyDetail(stats)
    : formatChanged(box.stats);
}

export function optimizePassCopyText(stats: OptimizerStats): string {
  const lines = [
    `IR rounds\t${stats.outerOptimizeLoops}`,
    `Block rounds\t${stats.blockOptimizeLoops}`,
    ...allPassBoxes(stats).map((box) => `${box.label}\t${box.stats.changed}`),
    `Prune unused helpers\t${stats.passes.prune.changed}`,
    `Simplify — max passes\t${stats.simplify.maxPasses}`,
    `Simplify — sum passes\t${stats.simplify.sumPasses}`,
  ];
  return lines.join('\n');
}
