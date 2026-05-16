import { assertCheckable } from './checkability.ts';
import { normalizeNode } from './normalize.ts';
import { build, optimize, renderChecker } from './pipeline.ts';
import type { GenerateCheckerOptions } from './php.ts';
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
export { assertCheckable } from './checkability.ts';
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
} from './php.ts';
export { normalizeNode } from './normalize.ts';
