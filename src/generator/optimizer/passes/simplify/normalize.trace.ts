import type { Expr } from '../../../ir/types.ts';
import { equals } from '../../../ir/equals.ts';
import {
  exprStep,
  seqReason,
  unchangedExpr,
} from '../../trace/rewrite.ts';
import type {
  ExprRewrite,
  OptimizeTraceRuleId,
  TraceReasoning,
  TraceStepReason,
} from '../../trace/types.ts';

/** One normalize rewrite collected while building a pure ExprRewrite. */
export type QuietCommitStep = {
  readonly rule: OptimizeTraceRuleId;
  readonly before: Expr;
  readonly after: Expr;
  readonly nested: readonly TraceStepReason[];
};

/** Collects structured normalize steps without committing to the checker head. */
export class QuietStepSink {
  readonly #steps: QuietCommitStep[] = [];

  push(step: QuietCommitStep): void {
    this.#steps.push(step);
  }

  snapshot(): readonly QuietCommitStep[] {
    return this.#steps;
  }

  asReason(): TraceReasoning {
    return seqReason(this.#steps.map((step) => quietStepToReason(step)));
  }
}

function quietStepToReason(step: QuietCommitStep): TraceStepReason {
  return exprStep(step.rule, step.before, step.after, step.nested);
}

/** Note a rewrite; returns `after` as the continuing expr form. */
export function noteNormalize(
  quiet: QuietStepSink,
  rule: OptimizeTraceRuleId,
  before: Expr,
  after: Expr,
): Expr {
  if (equals(before, after)) {
    return before;
  }
  quiet.push({ rule, before, after, nested: [] });
  return after;
}

/** Note a composed parent rewrite with nested quiet cleanup as children. */
export function noteNormalizeParent(
  quiet: QuietStepSink,
  rule: OptimizeTraceRuleId,
  before: Expr,
  after: Expr,
  nested: readonly QuietCommitStep[],
): Expr {
  if (equals(before, after)) {
    return before;
  }
  quiet.push({
    rule,
    before,
    after,
    nested: nested.map((step) => quietStepToReason(step)),
  });
  return after;
}

/** Note a rewrite with already-built nested proof children. */
export function noteNormalizeWithChildren(
  quiet: QuietStepSink,
  rule: OptimizeTraceRuleId,
  before: Expr,
  after: Expr,
  nested: readonly TraceStepReason[],
): Expr {
  if (equals(before, after)) {
    return before;
  }
  quiet.push({ rule, before, after, nested });
  return after;
}

export function rewriteFromQuiet(
  expr: Expr,
  quiet: QuietStepSink,
): ExprRewrite {
  const reason = quiet.asReason();
  if (reason.kind === 'none') {
    return unchangedExpr(expr);
  }
  return { expr, reason };
}
