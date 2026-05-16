export type CheckerOutputMode =
  | 'function'
  | 'public_static'
  | 'protected_static'
  | 'private_static';

export interface GenerateCheckerOptions {
  output?: CheckerOutputMode;
  /**
   * When `true` (default), emit `is{Type}` helper names and a type-based entry function.
   * When `false`, use legacy `check` / `check_N`.
   */
  nameFunctionsByType?: boolean;
  /**
   * Name of the emitted entry function or static method. Usually set together with
   * {@link emitBody}; defaults to `check` when using legacy naming.
   */
  mainFunctionName?: string;
  /**
   * When `true`, favor readable output: one `if` per guard, builder order (no hoisting).
   * When `false` (default), favor compact output: combined guards and hoisting for batching.
   */
  prioritizeReadabilityOverCompactness?: boolean;
}

export const DEFAULT_CHECKER_OUTPUT: CheckerOutputMode = 'function';
