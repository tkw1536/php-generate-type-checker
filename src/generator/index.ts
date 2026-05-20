import { buildMany, optimize, renderChecker } from './pipeline.ts';
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
