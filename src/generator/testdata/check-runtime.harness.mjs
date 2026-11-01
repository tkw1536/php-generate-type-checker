/**
 * Build a batched PHP STDIN harness for runtime cases.
 *
 * Each case lives in `namespace Runtime\r…` with a `run()`; global `main()`
 * invokes every run and exits with the failed-case count.
 */
import { createHash } from 'node:crypto';
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
 * @typedef {{
 *   readonly namespaceId: string;
 *   readonly assertCount: number;
 *   readonly fragmentPhp: string;
 * }} CaseFragment
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
 * Stable case-identity key; never includes the generated PHP body.
 *
 * @param {RuntimeCase} item
 * @returns {string}
 */
function canonicalRuntimeCaseKey(item) {
  return JSON.stringify({
    kind: 'runtime',
    stem: item.stem,
    input: item.input,
    output: item.output,
    emitPhpstanTypeAliases: item.emitPhpstanTypeAliases,
    verbosePhpdoc: item.verbosePhpdoc,
    sealArrayShapes: item.sealArrayShapes,
  });
}

/**
 * PHP-safe namespace leaf: `r` + first 12 hex chars (distinct from golden `h` / `e`).
 *
 * @param {RuntimeCase} item
 * @returns {string}
 */
export function namespaceIdForRuntimeCase(item) {
  const hex = createHash('sha256')
    .update(canonicalRuntimeCaseKey(item), 'utf8')
    .digest('hex')
    .slice(0, 12);
  return `r${hex}`;
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
 * @param {string} call
 * @param {boolean} expected
 * @returns {string[]}
 */
function assertIfLines(label, call, expected) {
  const kind = expected ? 'example' : 'counterexample';
  const expectedLit = expected ? 'true' : 'false';
  return [
    `    if (!\\gtc_check(${phpSingleQuoted(`${label} ${kind} ${call}`)}, ${call}, ${expectedLit})) {`,
    `        $failures++;`,
    `    }`,
  ];
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
      lines.push(...assertIfLines(label, callOf(expr), true));
      assertCount += 1;
    }
    for (const expr of check.counterexamples) {
      lines.push(...assertIfLines(label, callOf(expr), false));
      assertCount += 1;
    }
  }
  return { lines, assertCount };
}

/**
 * Build one namespaced case fragment, or null when the case should be skipped.
 *
 * @param {RuntimeCase} item
 * @returns {CaseFragment | null}
 */
export function tryBuildCaseFragment(item) {
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
  const namespaceId = namespaceIdForRuntimeCase(item);
  const fragmentPhp = `namespace Runtime\\${namespaceId} {
${checkerPhp}
function run(): int
{
    $failures = 0;
${lines.join('\n')}
    return $failures;
}
}`;
  return { namespaceId, assertCount, fragmentPhp };
}

/**
 * @param {readonly CaseFragment[]} fragments
 */
function assertUniqueNamespaceIds(fragments) {
  /** @type {Set<string>} */
  const seen = new Set();
  for (const fragment of fragments) {
    if (seen.has(fragment.namespaceId)) {
      throw new Error(
        `duplicate runtime namespace id Runtime\\${fragment.namespaceId}`,
      );
    }
    seen.add(fragment.namespaceId);
  }
}

/**
 * @param {readonly CaseFragment[]} fragments
 * @returns {string}
 */
function buildMainPhp(fragments) {
  const mainCalls = fragments
    .map(
      (f) =>
        `    if (\\Runtime\\${f.namespaceId}\\run() > 0) {\n        $failedCases++;\n    }`,
    )
    .join('\n');
  return `namespace {
function main(): int
{
    $failedCases = 0;
${mainCalls}
    return $failedCases;
}

exit(main());
}`;
}

const GTC_CHECK_PHP = `namespace {
function gtc_check(string $label, mixed $got, bool $expected): bool
{
    if ($got !== $expected) {
        fwrite(STDERR, 'FAIL ' . $label . ': expected ' . ($expected ? 'true' : 'false') . ', got ' . var_export($got, true) . "\\n");
        return false;
    }
    return true;
}
}`;

/**
 * Assemble one PHP program for all runnable case fragments.
 *
 * @param {readonly CaseFragment[]} fragments
 * @returns {string}
 */
export function assembleBatchPhp(fragments) {
  if (fragments.length === 0) {
    throw new Error('assembleBatchPhp requires at least one fragment');
  }
  assertUniqueNamespaceIds(fragments);
  const caseBlocks = fragments.map((f) => f.fragmentPhp).join('\n\n');
  return `<?php
declare(strict_types=1);

${GTC_CHECK_PHP}

${caseBlocks}

${buildMainPhp(fragments)}
`;
}
