import type { Expr } from '../../../ir/types.ts';
import { equals } from '../../../ir/equals.ts';
import type { OptimizeContext } from '../../context.ts';
import type {
  OptimizeTraceDetail,
  OptimizeTraceNestedStep,
  OptimizeTraceRuleId,
} from '../../trace/types.ts';

/** One quiet normalize rewrite to commit later (or flatten into nested detail). */
export type QuietCommitStep = {
  readonly rule: OptimizeTraceRuleId;
  readonly before: Expr;
  readonly after: Expr;
  /** Nested cleanup when this step is a composed parent (De Morgan / doubleNeg / factor). */
  readonly nested: readonly OptimizeTraceNestedStep[];
};

/** Flatten commit steps into nested-detail rows (parent + its nested cleanup). */
export function quietStepsAsNested(
  steps: readonly QuietCommitStep[],
): readonly OptimizeTraceNestedStep[] {
  const out: OptimizeTraceNestedStep[] = [];
  for (const step of steps) {
    out.push(
      { rule: step.rule, before: step.before, after: step.after },
      ...step.nested,
    );
  }
  return out;
}

/** Collects structured normalize steps without updating live IR. */
export class QuietStepSink {
  readonly #steps: QuietCommitStep[] = [];

  push(step: QuietCommitStep): void {
    this.#steps.push(step);
  }

  snapshot(): readonly QuietCommitStep[] {
    return this.#steps;
  }
}

/**
 * Record a rewrite against `before`, falling back to `live` when the
 * reconstructed `before` is not present in the live IR (e.g. flat junction
 * vs nested and/or). Returns the updated live expr when a record applies.
 *
 * When `quiet` is set, append nested steps instead of updating live IR.
 */
export function recordNormalize(
  ctx: Readonly<OptimizeContext> | undefined,
  quiet: QuietStepSink | null,
  rule: OptimizeTraceRuleId,
  before: Expr,
  after: Expr,
  live: Expr,
): Expr {
  if (equals(before, after)) {
    return live;
  }
  if (quiet !== null) {
    quiet.push({ rule, before, after, nested: [] });
    return after;
  }
  if (ctx === undefined) {
    return live;
  }
  if (ctx.trace.recordExpr(rule, before, after)) {
    return after;
  }
  if (!equals(live, before) && ctx.trace.recordExpr(rule, live, after)) {
    return after;
  }
  return live;
}

function nestedDetail(
  steps: readonly OptimizeTraceNestedStep[],
): OptimizeTraceDetail | undefined {
  return steps.length > 0 ? { kind: 'nested', steps } : undefined;
}

/** Record a composed parent rewrite, attaching nested quiet steps as detail. */
export function recordNormalizeParent(
  ctx: Readonly<OptimizeContext> | undefined,
  quiet: QuietStepSink | null,
  rule: OptimizeTraceRuleId,
  before: Expr,
  after: Expr,
  live: Expr,
  nestedSteps: readonly OptimizeTraceNestedStep[],
): Expr {
  if (equals(before, after)) {
    return live;
  }
  if (quiet !== null) {
    quiet.push({ rule, before, after, nested: nestedSteps });
    return after;
  }
  if (ctx === undefined) {
    return live;
  }
  const detail = nestedDetail(nestedSteps);
  if (ctx.trace.recordExpr(rule, before, after, detail)) {
    return after;
  }
  if (!equals(live, before) && ctx.trace.recordExpr(rule, live, after, detail)) {
    return after;
  }
  return live;
}
