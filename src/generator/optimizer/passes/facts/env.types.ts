import type { Expr } from '../../../ir/types.ts';
import { canonicalizeFactExpr } from './canon.ts';

export type FactOriginId = 'ifTrue' | 'ifFalse' | 'arrayKey';

export type FactReasonId =
  | 'assumed'
  | 'andSplit'
  | 'orSplit'
  | 'notFlip'
  | 'commute'
  | 'deMorgan'
  | 'exclusive'
  | 'equalityType'
  | 'instanceofObject'
  | 'isAClassExists';

export type EnvHow =
  | { readonly kind: 'assumed'; readonly origin: FactOriginId }
  | {
      readonly kind: 'derive';
      readonly rule: Exclude<FactReasonId, 'assumed'>;
      readonly premises: readonly EnvFact[];
    };

export type EnvFact = {
  readonly expr: Expr;
  readonly known: 'true' | 'false';
  readonly origin: FactOriginId;
  readonly how: EnvHow;
};

export type FactEntry = {
  readonly expr: Expr;
  readonly origin: FactOriginId;
  readonly reason: FactReasonId;
  readonly how: EnvHow;
};

export type FactEnv = {
  readonly trueFacts: readonly FactEntry[];
  readonly falseFacts: readonly FactEntry[];
};

/** One successful env add for Trace (both polarities). */
export type EnvAddEvent = {
  readonly entry: FactEntry;
  readonly known: 'true' | 'false';
  /** Premise entry that justified a derive (assumed seeds have none). */
  readonly from: FactEntry | null;
};

/** Collects env adds until flushed as `facts.env.extend`. */
export class EnvTraceSink {
  readonly #events: EnvAddEvent[] = [];

  push(event: EnvAddEvent): void {
    this.#events.push(event);
  }

  take(): readonly EnvAddEvent[] {
    const out = this.#events.slice();
    this.#events.length = 0;
    return out;
  }

  get pending(): number {
    return this.#events.length;
  }
}

export function emptyFactEnv(): FactEnv {
  return { trueFacts: [], falseFacts: [] };
}

export function entryReason(how: EnvHow): FactReasonId {
  return how.kind === 'assumed' ? 'assumed' : how.rule;
}

export function toEnvFact(entry: FactEntry, known: 'true' | 'false'): EnvFact {
  return {
    expr: entry.expr,
    known,
    origin: entry.origin,
    how: entry.how,
  };
}

/** Build a fact entry for tests / manual env seeding. */
export function factEntry(
  expr: Expr,
  origin: FactOriginId,
  reason: FactReasonId = 'assumed',
): FactEntry {
  const canon = canonicalizeFactExpr(expr);
  const how: EnvHow =
    reason === 'assumed'
      ? { kind: 'assumed', origin }
      : {
          kind: 'derive',
          rule: reason,
          premises: [
            {
              expr: canon,
              known: 'true',
              origin,
              how: { kind: 'assumed', origin },
            },
          ],
        };
  return { expr: canon, origin, reason, how };
}

/** Prefer an origin already present in the env; default to ifTrue. */
export function envOrigin(env: FactEnv): FactOriginId {
  const first = env.trueFacts[0] ?? env.falseFacts[0];
  return first?.origin ?? 'ifTrue';
}

export function factEntryAsEnvFact(
  entry: FactEntry,
  known: 'true' | 'false',
): EnvFact {
  return toEnvFact(entry, known);
}
