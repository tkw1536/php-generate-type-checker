import type { Expr } from '../../../ir/types.ts';
import type { TheoryRuleId } from '../../theory/types.ts';

export type FactOriginId = 'ifTrue' | 'ifFalse' | 'arrayKey';

/** Structural env expansions (not theory Horn rules). */
export type EnvStructuralId =
  | 'andSplit'
  | 'orSplit'
  | 'notFlip'
  | 'commute'
  | 'deMorgan';

/**
 * Theory rules that are seeded into the env when their premise is known-true.
 * Other TheoryRuleIds stay on-demand via imply only.
 */
export type EnvSeededTheoryRuleId = Extract<
  TheoryRuleId,
  'exclusive' | 'equalityType' | 'instanceofObject' | 'isAClassExists'
>;

/** How a fact entered the env (assumed, structural derive, or theory seed). */
export type EnvLeafId = 'assumed' | EnvStructuralId | EnvSeededTheoryRuleId;

const ENV_SEEDED_THEORY = new Set<string>([
  'exclusive',
  'equalityType',
  'instanceofObject',
  'isAClassExists',
]);

export function isEnvSeededTheoryRule(
  ruleId: TheoryRuleId,
): ruleId is EnvSeededTheoryRuleId {
  return ENV_SEEDED_THEORY.has(ruleId);
}

export type EnvHow =
  | { readonly kind: 'assumed'; readonly origin: FactOriginId }
  | {
      readonly kind: 'derive';
      readonly rule: Exclude<EnvLeafId, 'assumed'>;
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

export function entryReason(how: EnvHow): EnvLeafId {
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
