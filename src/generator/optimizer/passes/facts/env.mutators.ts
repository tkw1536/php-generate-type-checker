import type { Expr } from '../../../ir/types.ts';
import type {
  EnvTraceSink,
  FactEntry,
  FactEnv,
  FactOriginId,
  FactReasonId,
} from './env.types.ts';

export type Flags = {
  readonly skipDeMorgan?: true;
};

export type FactMutators = {
  readonly withTrue: (
    env: FactEnv,
    expr: Expr,
    origin: FactOriginId,
    reason?: FactReasonId,
    flags?: Flags,
    sink?: EnvTraceSink,
    from?: FactEntry | null,
    fromKnown?: 'true' | 'false',
  ) => FactEnv;
  readonly withFalse: (
    env: FactEnv,
    expr: Expr,
    origin: FactOriginId,
    reason?: FactReasonId,
    flags?: Flags,
    sink?: EnvTraceSink,
    from?: FactEntry | null,
    fromKnown?: 'true' | 'false',
  ) => FactEnv;
};
