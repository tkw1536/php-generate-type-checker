import {
  FRONTMATTER_RE,
  parseFrontmatter,
  stripLeadingMarker,
  trimBlankLines,
} from './fixtureFormat.ts';

export interface GeneratorFixture {
  name: string;
  input: string;
  options: Record<string, string>;
  expectedBody: string;
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

  const options: Record<string, string> = {};
  for (const [key, value] of Object.entries(meta)) {
    if (key !== 'input' && key !== 'error' && key !== 'expect') {
      options[key] = value;
    }
  }

  const expectsError =
    meta.error === 'true' || meta.error === 'generation' || meta.expect === 'error';

  let body = trimBlankLines(match[2]);
  body = stripLeadingMarker(body, '<?php');
  body = trimBlankLines(body);

  return {
    name,
    input,
    options,
    expectedBody: body,
    expectsError,
  };
}

// Re-export for tests that import stripPhpOpeningTag
export const stripPhpOpeningTag = (body: string) => stripLeadingMarker(body, '<?php');
