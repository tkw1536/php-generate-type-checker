import type { Block, CheckerIR, Expr } from '../../ir/types.ts';
import type {
  FactOriginId,
  FactReasonId,
} from '../passes/facts/env.ts';

export type OptimizeTraceSnapshot =
  | {
      readonly kind: 'block';
      readonly block: Block;
      readonly tempNames: ReadonlyMap<number, string> | null;
    }
  | { readonly kind: 'expr'; readonly expr: Expr }
  | {
      readonly kind: 'ir';
      readonly ir: CheckerIR;
    };

export type TraceScopeSnapshot =
  | {
      readonly kind: 'block';
      readonly block: Block;
      readonly tempNames: ReadonlyMap<number, string> | null;
    }
  | {
      readonly kind: 'ir';
      readonly ir: CheckerIR;
    };

export type OptimizeTraceRuleId =
  | 'trace.baseline'
  | 'dedupe.drop'
  | 'unnest.collapse'
  | 'combine.merge'
  | 'flatten.fold'
  | 'inline.substitute'
  | 'facts.proveTrue'
  | 'facts.proveFalse'
  | 'facts.absorb'
  | 'simplify.expand'
  | 'simplify.absorb'
  | 'simplify.normalize.boolFold'
  | 'simplify.normalize.identity'
  | 'simplify.normalize.doubleNeg'
  | 'simplify.normalize.deMorgan'
  | 'simplify.normalize.factor'
  | 'simplify.normalize.absorb'
  | 'simplify.normalize.contradiction'
  | 'simplify.normalize.dedupe'
  | 'dce.dropFalse'
  | 'dce.spliceTrue'
  | 'dce.dropEmptyForeach'
  | 'dce.foldForeach'
  | 'dce.dropUnusedKey'
  | 'dce.dropUnreachable'
  | 'prune.remove';

/** A fact from the env used to justify a rewrite, with its known polarity. */
export type OptimizeTraceFactUse = {
  readonly expr: Expr;
  readonly known: 'true' | 'false';
  readonly origin: FactOriginId;
  /** How the fact entered the env (assumed, exclusive derivation, …). */
  readonly reason: FactReasonId;
  /**
   * Extra prove-time steps connecting this env fact to the folded expr
   * (e.g. `exclusive` when an OR of tags entails `¬is_array` via exclusivity).
   */
  readonly via?: readonly FactReasonId[];
};

/** Operand implication that justifies dropping one arm of a junction. */
export type OptimizeTraceImplication = {
  readonly from: Expr;
  readonly to: Expr;
};

/** A normalize rewrite collected under a parent De Morgan / doubleNeg / factor. */
export type OptimizeTraceNestedStep = {
  readonly rule: OptimizeTraceRuleId;
  readonly before: Expr;
  readonly after: Expr;
};

export type OptimizeTraceDetail =
  | { readonly kind: 'none' }
  | { readonly kind: 'facts'; readonly used: readonly OptimizeTraceFactUse[] }
  | {
      readonly kind: 'absorb';
      readonly implications: readonly OptimizeTraceImplication[];
      /** Env facts that justified the implication; may be empty when structural. */
      readonly used: readonly OptimizeTraceFactUse[];
    }
  | {
      readonly kind: 'nested';
      readonly steps: readonly OptimizeTraceNestedStep[];
    }
  | { readonly kind: 'inline'; readonly callee: string }
  | { readonly kind: 'prune'; readonly removed: string };

export type OptimizeTraceEvent = {
  readonly index: number;
  readonly rule: OptimizeTraceRuleId;
  readonly program: string;
  readonly outerLoop: number;
  readonly blockLoop: number;
  readonly detail: OptimizeTraceDetail;
  /** Local changed fragment (may be expr). */
  readonly focus: {
    readonly before: OptimizeTraceSnapshot;
    readonly after: OptimizeTraceSnapshot;
  };
  /** Enclosing code for the UI PHP diff — always block or IR. */
  readonly scope: {
    readonly before: TraceScopeSnapshot;
    readonly after: TraceScopeSnapshot;
  };
  /** Full checker body (or IR for prune) for Before/After views. */
  readonly checker: {
    readonly before: TraceScopeSnapshot;
    readonly after: TraceScopeSnapshot;
  };
};
