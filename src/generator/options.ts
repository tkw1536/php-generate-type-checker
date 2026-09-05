export type CheckerOutputMode =
  | 'function'
  | 'public_static'
  | 'protected_static'
  | 'private_static';

export interface GenerateCheckerOptions {
  readonly output?: CheckerOutputMode;
  /**
   * When `true` (default), emit `is{Type}` helper names and a type-based entry function.
   * When `false`, use legacy `check` / `check_N`.
   */
  readonly nameFunctionsByType?: boolean;
  /**
   * Name of the emitted entry function or static method. Usually set together with
   * {@link emitBody}; defaults to `check` when using legacy naming.
   */
  readonly mainFunctionName?: string;
  /**
   * When `true`, favor readable output: one `if` per guard, builder order (no hoisting).
   * When `false` (default), favor compact output: combined guards and hoisting for batching.
   */
  readonly prioritizeReadabilityOverCompactness?: boolean;
  /**
   * When `true`, emit a multi-line Drupal-style PHPDoc (summary, `@param`, `@return`,
   * `@phpstan-assert-if-true`). When `false` (default), emit a one-line assert comment.
   */
  readonly verbosePhpdoc?: boolean;
}

export const DEFAULT_CHECKER_OUTPUT: CheckerOutputMode = 'function';
