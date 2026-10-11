import type { Block, CheckerIR, Expr } from '../../ir/types.ts';

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
  | 'facts.commit'
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
};

export type OptimizeTraceDetail =
  | { readonly kind: 'none' }
  | { readonly kind: 'facts'; readonly used: readonly OptimizeTraceFactUse[] }
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
