import { build, buildMany, optimize, renderChecker } from './pipeline.ts';
import type { GenerateCheckerOptions } from './options.ts';
import { parseTypes } from '../parser/index.ts';

/** Composed pipeline; used by fixture tests. */
export function generateChecker(
  typeString: string,
  options?: GenerateCheckerOptions,
): string {
  const { segments } = parseTypes(typeString);
  const types = segments.map((s) => s.ast);
  const { ir: built, typesByName } = buildMany(types, options);
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
export {
  build,
  buildMany,
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
