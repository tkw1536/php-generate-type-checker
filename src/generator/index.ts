import type { GenerateCheckerOptions } from './options.ts';
import { runGeneratePipeline } from './runPipeline.ts';

export type GenerateCheckerOptionsWithAliases = GenerateCheckerOptions & {
  readonly emitPhpstanTypeAliases?: boolean;
  /** Inline alias cross-references instead of calling entry checkers. Default: false. */
  readonly resolveAliases?: boolean;
};

/**
 * PHP-only convenience for goldens and callers that do not need Trace.
 * Live UI/CLI use {@link runGeneratePipeline} so steps are retained.
 */
export function generateChecker(
  typeString: string,
  options?: GenerateCheckerOptionsWithAliases,
): string {
  return runGeneratePipeline(typeString, options).php;
}
