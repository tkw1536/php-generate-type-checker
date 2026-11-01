/**
 * Build a PHP STDIN harness for one runtime case.
 */
import { astsWithAliasesInlined } from '../../examples/inlineAliases.ts';
import { unresolvedNamedTypes } from '../../examples/named.ts';
import {
  counterexampleExpressions,
  exampleExpressions,
} from '../../examples/pack.ts';
import { parseCheckerInput } from '../../parser/parseInput.ts';
import { generateChecker } from '../index.ts';

/** @typedef {import('./check-runtime.cases.mjs').RuntimeCase} RuntimeCase */

/**
 * @typedef {{
 *   readonly functionName: string;
 *   readonly examples: readonly string[];
 *   readonly counterexamples: readonly string[];
 * }} EntryChecks
 */

/**
 * @param {string} value
 * @returns {string}
 */
function phpSingleQuoted(value) {
  return `'${value.replaceAll('\\', '\\\\').replaceAll("'", "\\'")}'`;
}

/**
 * @param {string} input
 * @returns {string}
 */
function shortInput(input) {
  const oneLine = input.replaceAll(/\s+/gu, ' ').trim();
  if (oneLine.length <= 80) {
    return oneLine;
  }
  return `${oneLine.slice(0, 77)}...`;
}

/**
 * @param {RuntimeCase} item
 * @returns {string}
 */
export function caseLabel(item) {
  return `${item.stem}: ${shortInput(item.input)}`;
}

/**
 * @param {RuntimeCase} item
 * @returns {EntryChecks[]}
 */
function collectChecks(item) {
  /** @type {EntryChecks[]} */
  const checks = [];
  const entries = parseCheckerInput(item.input);
  const asts = astsWithAliasesInlined(entries);
  for (const [index, entry] of entries.entries()) {
    const ast = asts[index];
    if (unresolvedNamedTypes(ast, item.requireClass).length > 0) {
      continue;
    }
    const examples = exampleExpressions(ast);
    const counterexamples = counterexampleExpressions(ast);
    if (examples.length === 0 && counterexamples.length === 0) {
      continue;
    }
    checks.push({
      functionName: entry.functionName,
      examples,
      counterexamples,
    });
  }
  return checks;
}

/**
 * @param {string} label
 * @param {string} output
 * @param {readonly EntryChecks[]} checks
 * @returns {{ lines: string[]; assertCount: number }}
 */
function buildAssertLines(label, output, checks) {
  /** @type {string[]} */
  const lines = [];
  let assertCount = 0;
  for (const check of checks) {
    const callOf = (expr) =>
      output === 'public_static'
        ? `TypeChecker::${check.functionName}(${expr})`
        : `${check.functionName}(${expr})`;
    for (const expr of check.examples) {
      const call = callOf(expr);
      lines.push(
        `gtc_check(${phpSingleQuoted(`${label} example ${call}`)}, ${call}, true);`,
      );
      assertCount += 1;
    }
    for (const expr of check.counterexamples) {
      const call = callOf(expr);
      lines.push(
        `gtc_check(${phpSingleQuoted(`${label} counterexample ${call}`)}, ${call}, false);`,
      );
      assertCount += 1;
    }
  }
  return { lines, assertCount };
}

/**
 * @param {string} checkerPhp
 * @param {readonly string[]} assertLines
 * @returns {string}
 */
function assembleHarnessPhp(checkerPhp, assertLines) {
  return `<?php
declare(strict_types=1);

${checkerPhp}
$failures = 0;
function gtc_check(string $label, mixed $got, bool $expected): void
{
    global $failures;
    if ($got !== $expected) {
        fwrite(STDERR, 'FAIL ' . $label . ': expected ' . ($expected ? 'true' : 'false') . ', got ' . var_export($got, true) . "\\n");
        $failures++;
    }
}

${assertLines.join('\n')}
exit($failures === 0 ? 0 : 1);
`;
}

/**
 * @param {RuntimeCase} item
 * @returns {{ harness: string; assertCount: number } | null}
 */
export function buildHarness(item) {
  if (item.requireClass.length > 0) {
    return null;
  }
  if (item.output !== 'function' && item.output !== 'public_static') {
    // protected / private methods are not callable from the harness.
    return null;
  }

  const checks = collectChecks(item);
  if (checks.length === 0) {
    return null;
  }

  const checkerPhp = generateChecker(item.input, {
    output: item.output,
    emitPhpstanTypeAliases: item.emitPhpstanTypeAliases,
    verbosePhpdoc: item.verbosePhpdoc,
    sealArrayShapes: item.sealArrayShapes,
  });
  const { lines, assertCount } = buildAssertLines(
    caseLabel(item),
    item.output,
    checks,
  );
  return {
    harness: assembleHarnessPhp(checkerPhp, lines),
    assertCount,
  };
}
