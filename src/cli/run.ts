import { astsWithAliasesInlined } from '../examples/inlineAliases.ts';
import {
  packExamplesPhp,
  renameExampleHarness,
} from '../examples/pack.ts';
import { formatTypeAstJson } from '../generator/typeAstJson.ts';
import { runGeneratePipeline } from '../generator/runPipeline.ts';
import { parseCheckerInput } from '../parser/parseInput.ts';
import type { CliArgs } from './args.ts';

/**
 * Run generate (or parse-only for `--type` / `--examples`) and return STDOUT text.
 * Maps stable CLI flags onto the same options bag as the UI.
 */
export function runCli(source: string, args: CliArgs): string {
  if (args.printType) {
    const entries = parseCheckerInput(source, {
      resolveAliases: args.resolveAliases,
    });
    return formatTypeAstJson(entries);
  }

  if (args.printExamples) {
    return formatExamplesCli(source);
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

/** Pack examples with sibling aliases inlined (ignores checker resolveAliases). */
function formatExamplesCli(source: string): string {
  const entries = parseCheckerInput(source);
  const asts = astsWithAliasesInlined(entries);
  const packed: string[] = [];
  for (const ast of asts) {
    const body = packExamplesPhp(ast);
    if (body !== null && body !== '') {
      packed.push(body);
    }
  }
  if (packed.length === 0) {
    return '';
  }
  if (packed.length === 1) {
    const only = packed[0];
    if (only === undefined) {
      throw new Error('never reached');
    }
    return only;
  }
  return packed
    .map((body, index) => renameExampleHarness(body, index))
    .join('\n');
}
