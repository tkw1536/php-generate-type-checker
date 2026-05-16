import { assertCheckable } from './semantics/checkability.ts';
import { normalizeNode } from './semantics/normalize.ts';
import { build, optimize, renderChecker } from './pipeline.ts';
import type { GenerateCheckerOptions } from './options.ts';
import { parseType } from '../parser/index.ts';

/** Composed pipeline; used by fixture tests. */
export function generateChecker(
  typeString: string,
  options?: GenerateCheckerOptions,
): string {
  const ast = normalizeNode(parseType(typeString));
  assertCheckable(ast, 'function');
  const { ir: built, typesByName } = build(ast, options);
  const ir = options?.prioritizeReadabilityOverCompactness
    ? built
    : optimize(built);
  return renderChecker(ir, {
    ...options,
    typeString: typeString.trim(),
    typesByName,
  });
}

export { GenerationError } from './errors.ts';
export { assertCheckable } from './semantics/checkability.ts';
export {
  build,
  optimize,
  renderChecker as render,
  type BuildResult,
  type CheckerIR,
} from './pipeline.ts';
export {
  type CheckerOutputMode,
  type GenerateCheckerOptions,
  DEFAULT_CHECKER_OUTPUT,
} from './options.ts';
export { normalizeNode } from './semantics/normalize.ts';
