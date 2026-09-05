import {
  buildEntries,
  optimize,
  renderChecker,
} from './pipeline.ts';
import type { GenerateCheckerOptions } from './options.ts';
import { parseCheckerInput } from "../parser/parseInput.ts";

export type GenerateCheckerOptionsWithAliases = GenerateCheckerOptions & {
  readonly emitPhpstanTypeAliases?: boolean;
  /** Inline alias cross-references instead of calling entry checkers. Default: false. */
  readonly resolveAliases?: boolean;
};

/** Composed pipeline; used by fixture tests and the UI. */
export function generateChecker(
  typeString: string,
  options?: GenerateCheckerOptionsWithAliases,
): string {
  const entries = parseCheckerInput(typeString, {
    resolveAliases: options?.resolveAliases,
  });
  const {
    ir: built,
    typesByName,
    docStringsByName,
    phpstanTypeAliases,
  } = buildEntries(entries, {
    ...options,
    segmentSources: entries.map((e) => e.typeString),
  });
  const ir =
    options?.prioritizeReadabilityOverCompactness === true
      ? built
      : optimize(built);
  return renderChecker(ir, {
    ...options,
    typeString: typeString.trim(),
    typesByName,
    docStringsByName,
    phpstanTypeAliases,
    emitPhpstanTypeAliases: options?.emitPhpstanTypeAliases,
  });
}
