import { formatTypeAstJson } from '../generator/typeAstJson.ts';
import { runGeneratePipeline } from '../generator/runPipeline.ts';
import { parseCheckerInput } from '../parser/parseInput.ts';
import type { CliArgs } from './args.ts';

/**
 * Run generate (or parse-only for `--type`) and return STDOUT text.
 * Maps stable CLI flags onto the same options bag as the UI.
 */
export function runCli(source: string, args: CliArgs): string {
  if (args.printType) {
    const entries = parseCheckerInput(source, {
      resolveAliases: args.resolveAliases,
    });
    return formatTypeAstJson(entries);
  }

  const result = runGeneratePipeline(source, {
    output: args.emit,
    // UI Optimize on ⇒ prioritizeReadabilityOverCompactness off.
    prioritizeReadabilityOverCompactness: !args.optimize,
    verbosePhpdoc: args.verbosePhpdoc,
    emitPhpstanTypeAliases: args.emitAliases,
    resolveAliases: args.resolveAliases,
    sealArrayShapes: args.sealArrayShapes,
    unsafeStringArrayKeys: args.unsafeStringArrayKeys,
  });

  if (args.printTrace) {
    return JSON.stringify(result.steps, null, 2);
  }
  return result.php;
}
