/**
 * Examples golden writers shared by `update-testdata.mjs`.
 */
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  packExamplesPhp,
  renameExampleHarness,
} from '../../examples/pack.ts';
import { parseType } from '../../parser/index.ts';
import { parseCheckerInput } from '../../parser/parseInput.ts';
import {
  formatExamplesGoldenPhp,
  namespaceIdForExamplesCase,
} from './examplesGolden.ts';

/**
 * @param {string} input
 * @param {readonly string[]} requireClass
 * @returns {string | null} harness body, or null to omit the golden case
 */
export function buildExamplesBody(input, requireClass) {
  try {
    return packExamplesPhp(parseType(input), { requireClass });
  } catch {
    const entries = parseCheckerInput(input);
    if (entries.length === 0) {
      return '// no examples\n';
    }
    /** @type {string[]} */
    const packed = [];
    for (const entry of entries) {
      const body = packExamplesPhp(entry.ast, { requireClass });
      if (body !== null) {
        packed.push(body);
      }
    }
    if (packed.length === 0) {
      return null;
    }
    if (packed.length === 1) {
      return packed[0];
    }
    return packed
      .map((body, index) => renameExampleHarness(body, index))
      .join('\n');
  }
}

/**
 * @param {string} testdataDir
 * @param {(id: string, label: string) => void} registerNamespaceId
 * @param {string} stem
 * @param {readonly { readonly meta: import('./examplesGolden.ts').ExamplesGoldenMeta; readonly expected: string }[]} cases
 */
export function writeExamplesGoldenPhp(
  testdataDir,
  registerNamespaceId,
  stem,
  cases,
) {
  for (const item of cases) {
    registerNamespaceId(
      namespaceIdForExamplesCase(item.meta),
      `examples:${stem}: ${JSON.stringify(item.meta.input)}`,
    );
  }
  const fixturePath = path.resolve(testdataDir, `${stem}.examples.golden.php`);
  const source = formatExamplesGoldenPhp(stem, cases);
  writeFileSync(fixturePath, source);
  const written = (source.match(/^\/\/ @gtc-golden-begin /gmu) ?? []).length;
  console.log(`Wrote ${written} examples cases to ${fixturePath}`);
}

/**
 * @param {string} stem
 * @param {string} input
 * @param {readonly string[]} requireClass
 * @returns {{ meta: import('./examplesGolden.ts').ExamplesGoldenMeta; expected: string } | null}
 */
export function buildExamplesCase(stem, input, requireClass) {
  try {
    const expected = buildExamplesBody(input, requireClass);
    if (expected === null) {
      return null;
    }
    return {
      meta: {
        stem,
        input,
        ...(requireClass.length > 0 ? { requireClass } : {}),
      },
      expected,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn('examples skip', stem, JSON.stringify(input), message);
    return null;
  }
}

/**
 * @param {string} testdataDir
 * @param {(id: string, label: string) => void} registerNamespaceId
 * @param {string} stem
 * @param {readonly import('./readInSources.ts').InSourceLine[]} sources
 */
export function writeExamplesFromSources(
  testdataDir,
  registerNamespaceId,
  stem,
  sources,
) {
  /** @type {{ meta: import('./examplesGolden.ts').ExamplesGoldenMeta; expected: string }[]} */
  const out = [];
  /** @type {Set<string>} */
  const seen = new Set();
  for (const { input, requireClass } of sources) {
    if (seen.has(input)) {
      continue;
    }
    seen.add(input);
    const item = buildExamplesCase(stem, input, requireClass);
    if (item !== null) {
      out.push(item);
    }
  }
  writeExamplesGoldenPhp(testdataDir, registerNamespaceId, stem, out);
}
