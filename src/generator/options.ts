export type CheckerOutputMode =
  | 'function'
  | 'public_static'
  | 'protected_static'
  | 'private_static';

export interface GenerateCheckerOptions {
  readonly output?: CheckerOutputMode;
  /**
   * Name of the emitted entry function or static method.
   * Defaults to `check` when not provided by the caller.
   */
  readonly mainFunctionName?: string;
  /**
   * When `true`, favor readable output: one `if` per guard, builder order (no hoisting).
   * When `false` (default), favor compact output: combined guards and hoisting for batching.
   */
  readonly prioritizeReadabilityOverCompactness?: boolean;
  /**
   * When `true`, emit a multi-line Drupal-style PHPDoc (method summary, `@param`,
   * `@return`, `@phpstan-assert-if-true`; for class output also a class summary).
   * When `false` (default), emit a one-line assert comment.
   */
  readonly verbosePhpdoc?: boolean;
  /**
   * When `true`, treat sealed array/list shapes (no `...`) as unsealed for
   * runtime codegen only (matching older PHPStan behavior that allowed extra
   * keys). `@phpstan-assert-if-true` still uses the input type as written.
   * When `false` (default), sealed shapes reject unknown keys.
   */
  readonly unsealArrayShapes?: boolean;
  /**
   * When `true`, rewrite `array` / `non-empty-array` keys that are exactly
   * `string` to `int|non-decimal-int-string` for runtime codegen only
   * (PHPStan `reportUnsafeArrayStringKeyCasting: detect`). Assert docs still
   * use the input type. When `false` (default), keep `string` key checks
   * (same runtime accept set as PHPStan default / `prevent` for real arrays).
   */
  readonly unsafeStringArrayKeys?: boolean;
}

export const DEFAULT_CHECKER_OUTPUT: CheckerOutputMode = 'function';
