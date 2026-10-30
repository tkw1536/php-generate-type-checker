/**
 * Examples-golden dumpType bookkeeping for `check-phpstan.mjs`.
 *
 * Line numbers join PHPStan raw output to call sites; failure messages name
 * the example expression and golden, not the line.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * @typedef {import('./check-phpstan.fixtures.mjs').GoldenLineRange} GoldenLineRange
 */

/**
 * @typedef {{
 *   readonly key: string;
 *   readonly basename: string;
 *   readonly line: number;
 *   readonly goldenName: string;
 *   readonly exampleExpr: string;
 * }} ExpectedDumpSite
 */

const DUMP_CALL_RE =
  /^\\PHPStan\\dumpType\(example\d*\((.*)\)\);$/u;
const RAW_DUMP_RE =
  /^(.+\.examples\.golden\.php):(\d+):Dumped type: (.+) \[identifier=phpstan\.dumpType\]$/u;

/**
 * @param {readonly GoldenLineRange[]} ranges
 * @param {string} basename
 * @param {number} lineNo
 * @returns {string | null}
 */
function goldenNameForLine(ranges, basename, lineNo) {
  for (const range of ranges) {
    if (
      range.basename === basename &&
      lineNo >= range.startLine &&
      lineNo <= range.endLine
    ) {
      return range.name;
    }
  }
  return null;
}

/**
 * @param {readonly string[]} phpPaths
 * @param {readonly GoldenLineRange[]} ranges
 * @returns {Map<string, ExpectedDumpSite>}
 */
export function loadExpectedDumpSites(phpPaths, ranges) {
  /** @type {Map<string, ExpectedDumpSite>} */
  const expected = new Map();
  for (const filePath of phpPaths) {
    const basename = path.basename(filePath);
    const lines = readFileSync(filePath, 'utf8').split('\n');
    for (let i = 0; i < lines.length; i++) {
      const lineText = lines[i] ?? '';
      const match = DUMP_CALL_RE.exec(lineText.trim());
      if (match === null) {
        continue;
      }
      const line = i + 1;
      const exampleExpr = match[1];
      if (exampleExpr === undefined) {
        continue;
      }
      const goldenName =
        goldenNameForLine(ranges, basename, line) ?? `unknown (${basename})`;
      const key = `${basename}:${line}`;
      expected.set(key, {
        key,
        basename,
        line,
        goldenName,
        exampleExpr,
      });
    }
  }
  return expected;
}

/**
 * @param {string} testdataPrefix
 * @param {string} stdout
 * @returns {Map<string, string>} key → dumped type text
 */
export function parseDumpTypeResults(testdataPrefix, stdout) {
  /** @type {Map<string, string>} */
  const actual = new Map();
  for (const rawLine of stdout.split('\n')) {
    if (rawLine.length === 0) {
      continue;
    }
    const line = rawLine.startsWith(testdataPrefix)
      ? rawLine.slice(testdataPrefix.length)
      : rawLine;
    const match = RAW_DUMP_RE.exec(line);
    if (match === null) {
      continue;
    }
    const filePart = match[1];
    const lineStr = match[2];
    const dumped = match[3];
    if (
      filePart === undefined ||
      lineStr === undefined ||
      dumped === undefined
    ) {
      continue;
    }
    const basename = path.basename(filePart);
    actual.set(`${basename}:${Number(lineStr)}`, dumped);
  }
  return actual;
}

/**
 * Compare expected dump sites to actual dumpType results.
 * Prints human-facing failures keyed by golden + example expression.
 *
 * @param {Map<string, ExpectedDumpSite>} expected
 * @param {Map<string, string>} actual
 * @returns {number} number of failures printed
 */
export function reportDumpTypeFailures(expected, actual) {
  let failures = 0;
  for (const site of expected.values()) {
    const dumped = actual.get(site.key);
    if (dumped === undefined) {
      console.log(
        `${site.goldenName}: missing dumpType for example ${site.exampleExpr}`,
      );
      failures += 1;
      continue;
    }
    if (dumped !== 'true') {
      console.log(
        `${site.goldenName}: example ${site.exampleExpr} dumped ${dumped} (expected true)`,
      );
      failures += 1;
    }
  }
  for (const [key, dumped] of actual) {
    if (expected.has(key)) {
      continue;
    }
    console.log(
      `unexpected dumpType at ${key}: Dumped type: ${dumped}`,
    );
    failures += 1;
  }
  return failures;
}
