import {
  hasPhpstanTypeAliases,
  parseCheckerInput,
  type ParsedCheckerEntry,
} from '../parser/parseInput.ts';
import type { TraceStep } from './optimizer/trace/types.ts';
import type { GenerateCheckerOptions } from './options.ts';
import { buildEntries, optimize, renderChecker } from './pipeline.ts';

/** Same option bag as `generateChecker`; local to avoid importing `index`. */
type PipelineOptions = GenerateCheckerOptions & {
  readonly emitPhpstanTypeAliases?: boolean;
  readonly resolveAliases?: boolean;
};

/**
 * Parse → build → optional optimize → render.
 * Same stage sequence as the UI; keeps optimizer steps for Trace.
 */
export function runGeneratePipeline(
  typeString: string,
  options?: PipelineOptions,
): {
  readonly entries: readonly ParsedCheckerEntry[];
  readonly php: string;
  readonly optimizeRan: boolean;
  readonly steps: readonly TraceStep[];
} {
  const entries = parseCheckerInput(typeString, {
    resolveAliases: options?.resolveAliases,
  });
  const built = buildEntries(entries, {
    ...options,
    segmentSources: entries.map((e) => e.typeString),
  });

  // Match UI Optimize: skip when favoring readability over compactness.
  const skipOptimize = options?.prioritizeReadabilityOverCompactness === true;
  const optimized = skipOptimize ? null : optimize(built.ir);
  const ir = optimized?.ir ?? built.ir;
  const steps = optimized?.steps ?? [];

  const php = renderChecker(ir, {
    ...options,
    typeString: typeString.trim(),
    typesByName: built.typesByName,
    docStringsByName: built.docStringsByName,
    phpstanTypeAliases: built.phpstanTypeAliases,
    emitPhpstanTypeAliases:
      hasPhpstanTypeAliases(entries) && options?.emitPhpstanTypeAliases === true,
  });

  return {
    entries,
    php,
    optimizeRan: optimized !== null,
    steps,
  };
}
