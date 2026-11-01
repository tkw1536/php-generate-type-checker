import { describe, expect, it } from 'vitest';
import { parseCheckerInput } from '../parser/parseInput.ts';
import { generateExamples } from './generate.ts';
import { generateNonExamples } from './generate.non.ts';
import { astsWithAliasesInlined } from './inlineAliases.ts';
import { unresolvedNamedTypes } from './named.ts';
import { packExamplesPhp } from './pack.ts';

const POST_LIST_DOCBLOCK = `/**
 * @phpstan-type PostSummary array{
 *   id: positive-int,
 *   slug: non-empty-string,
 *   title: string
 * }
 * @phpstan-type PaginationMeta array{
 *   page: positive-int,
 *   perPage: positive-int,
 *   total: int
 * }
 * @phpstan-type PostListResponse array{
 *   posts: list<PostSummary>,
 *   meta: PaginationMeta
 * }
 */`;

describe('astsWithAliasesInlined', () => {
  it('leaves plain types unchanged', () => {
    const entries = parseCheckerInput('int');
    expect(astsWithAliasesInlined(entries)).toEqual([entries[0].ast]);
  });

  it('inlines sibling aliases without resolveAliases on parse', () => {
    const entries = parseCheckerInput(POST_LIST_DOCBLOCK);
    const responseIndex = entries.findIndex(
      (e) => e.aliasName === 'PostListResponse',
    );
    const response = entries[responseIndex];
    expect(unresolvedNamedTypes(response.ast, [])).toEqual([
      'PostSummary',
      'PaginationMeta',
    ]);
    expect(generateExamples(response.ast)).toEqual([]);

    const responseAst = astsWithAliasesInlined(entries)[responseIndex];
    expect(unresolvedNamedTypes(responseAst, [])).toEqual([]);
    expect(generateExamples(responseAst).length).toBeGreaterThan(0);
    expect(generateNonExamples(responseAst).length).toBeGreaterThan(0);
    const packed = packExamplesPhp(responseAst);
    expect(packed).toEqual(expect.any(String));
    expect(packed).not.toBe('');
    expect(packed).toContain(
      'array{posts: list<array{id: positive-int, slug: non-empty-string, title: string}>, meta: array{page: positive-int, perPage: positive-int, total: int}}',
    );
  });
});
