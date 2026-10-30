import type { Expr } from '../../../ir/types.ts';
import type {
  EnvLeafId,
  FactEntry,
  FactEnv,
  FactOriginId,
} from './env.types.ts';

export type Flags = {
  readonly skipDeMorgan?: true;
};

export type FactMutators = {
  readonly withTrue: (
    env: FactEnv,
    expr: Expr,
    origin: FactOriginId,
    reason?: EnvLeafId,
    flags?: Flags,
    from?: FactEntry | null,
    fromKnown?: 'true' | 'false',
  ) => FactEnv;
  readonly withFalse: (
    env: FactEnv,
    expr: Expr,
    origin: FactOriginId,
    reason?: EnvLeafId,
    flags?: Flags,
    from?: FactEntry | null,
    fromKnown?: 'true' | 'false',
  ) => FactEnv;
};
