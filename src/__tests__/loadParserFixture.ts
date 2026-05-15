import type { TypeNode } from '../parser/ast.ts';
import {
  splitFixture,
  stripLeadingMarker,
  trimBlankLines,
} from './fixtureFormat.ts';

export interface ParserFixture {
  name: string;
  input: string;
  expected?: TypeNode;
  expectsError: boolean;
  errorContains?: string;
}

export function parseParserFixture(content: string, name: string): ParserFixture {
  const { meta, body: rawBody } = splitFixture(content, name);
  const input = meta.input;
  if (input === undefined) {
    throw new Error(`Fixture "${name}" is missing required frontmatter key: input`);
  }

  const expectsError =
    meta.error === 'parse' ||
    meta.error === 'lexer' ||
    meta.error === 'true' ||
    meta.expect === 'error';
  const errorContains = meta.messageContains || meta.errorContains;

  let body = trimBlankLines(rawBody);
  body = stripLeadingMarker(body, '// json');
  body = trimBlankLines(body);

  if (expectsError) {
    return {
      name,
      input,
      expectsError: true,
      errorContains: errorContains || undefined,
    };
  }

  let expected: TypeNode;
  try {
    expected = JSON.parse(body) as TypeNode;
  } catch {
    throw new Error(`Fixture "${name}" body is not valid JSON`);
  }

  return {
    name,
    input,
    expected,
    expectsError: false,
  };
}
