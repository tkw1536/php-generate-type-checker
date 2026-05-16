import {
  DEFAULT_CHECKER_OUTPUT,
  type CheckerOutputMode,
} from '../generator/php.ts';
import {
  FRONTMATTER_RE,
  parseFrontmatter,
  stripLeadingMarker,
  trimBlankLines,
} from './fixtureFormat.ts';

const OUTPUT_VALUES: readonly CheckerOutputMode[] = [
  'function',
  'public_static',
  'protected_static',
  'private_static',
];

export function parseCheckerOutput(meta: Record<string, string>): CheckerOutputMode {
  const raw = meta.output?.trim();
  if (raw === undefined || raw === '') {
    return DEFAULT_CHECKER_OUTPUT;
  }
  if ((OUTPUT_VALUES as readonly string[]).includes(raw)) {
    return raw as CheckerOutputMode;
  }
  throw new Error(
    `Invalid output mode "${raw}". Expected one of: ${OUTPUT_VALUES.join(', ')}`,
  );
}

export interface GeneratorFixture {
  name: string;
  input: string;
  /** Declared in fixture frontmatter as `output: function | public_static | …` */
  output: CheckerOutputMode;
  options: Record<string, string>;
  /** Full generated PHP (PHPDoc, signature, and method body), after optional `<?php` is stripped */
  expected: string;
  expectsError: boolean;
}

export function parseGeneratorFixture(content: string, name: string): GeneratorFixture {
  const match = content.match(FRONTMATTER_RE);
  if (!match) {
    throw new Error(`Fixture "${name}" must start with YAML frontmatter delimited by ---`);
  }

  const meta = parseFrontmatter(match[1]);
  const input = meta.input;
  if (input === undefined) {
    throw new Error(`Fixture "${name}" is missing required frontmatter key: input`);
  }

  const output = parseCheckerOutput(meta);

  const options: Record<string, string> = {};
  for (const [key, value] of Object.entries(meta)) {
    if (key !== 'input' && key !== 'error' && key !== 'expect' && key !== 'output') {
      options[key] = value;
    }
  }

  const expectsError =
    meta.error === 'true' || meta.error === 'generation' || meta.expect === 'error';

  let expected = trimBlankLines(match[2]);
  expected = stripLeadingMarker(expected, '<?php');
  expected = trimBlankLines(expected);
  if (expected !== '' && !expected.endsWith('\n')) {
    expected += '\n';
  }

  return {
    name,
    input,
    output,
    options,
    expected,
    expectsError,
  };
}

// Re-export for tests that import stripPhpOpeningTag
export const stripPhpOpeningTag = (body: string) => stripLeadingMarker(body, '<?php');
