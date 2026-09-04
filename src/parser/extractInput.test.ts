import { describe, expect, it } from 'vitest';
import {
  extractInputTypes,
  extractPhpstanTypes,
} from './extractInput.ts';
import {
  formatPhpstanTypeAliasesBlock,
  PhpstanTypeExtractError,
} from './phpstanTypeDocblock.ts';

const POST_LIST_DOCBLOCK = `/**
 * Types for a paginated blog post list API response.
 *
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

const ANNOTATION_DOCBLOCK = `/**
 * Annotation Helper.
 *
 * @todo make this a service
 *
 * @phpstan-type AnnotationBody \\stdClass&object{
 *   elements: list<\\DOMElement>,
 *   context?: mixed
 * }
 * @phpstan-type AnnotationTarget \\stdClass&object{
 *   ref?: list<string>,
 *   type?: string,
 *   _entity_infos?: array<string, array{0: ?int, 1: ?string, 2: ?string}>
 * }
 * @phpstan-type AnnotationInput \\stdClass&object{
 *   id?: string,
 *   body: AnnotationBody,
 *   target?: AnnotationTarget,
 *   certainty?: string
 * }
 * @phpstan-type Annotation \\stdClass&object{
 *   id?: string,
 *   body: AnnotationBody,
 *   target: AnnotationTarget,
 *   certainty?: string
 * }
 */`;

function extractsPostListApiDocblockTypes(): void {
  const defs = extractInputTypes(POST_LIST_DOCBLOCK);
  expect(defs).toHaveLength(3);
  expect(defs.map((d) => d.name)).toEqual([
    'PostSummary',
    'PaginationMeta',
    'PostListResponse',
  ]);
  expect(defs[0].typeString).toBe(
    'array{ id: positive-int, slug: non-empty-string, title: string }',
  );
}

function extractsAnnotationDocblock(): void {
  const defs = extractInputTypes(ANNOTATION_DOCBLOCK);
  expect(defs).toHaveLength(4);
  expect(defs.map((d) => d.name)).toEqual([
    'AnnotationBody',
    'AnnotationTarget',
    'AnnotationInput',
    'Annotation',
  ]);
}

function extractsSingleLinePhpstanType(): void {
  const defs = extractInputTypes('/** @phpstan-type Foo int */');
  expect(defs).toEqual([
    expect.objectContaining({ name: 'Foo', typeString: 'int' }),
  ]);
}

function extractsPlainTypeExpressions(): void {
  const defs = extractInputTypes('array<string>array<int>');
  expect(defs).toHaveLength(2);
  expect(defs.map((d) => d.name)).toEqual([null, null]);
  expect(defs.map((d) => d.typeString)).toEqual([
    'array<string>',
    'array<int>',
  ]);
}

function extractsMultipleCommentsAndPlainTypes(): void {
  const defs = extractInputTypes(`/**
 * @phpstan-type Foo int
 */
string
/**
 * @phpstan-type Bar non-empty-string
 */
`);
  expect(defs).toHaveLength(3);
  expect(defs.map((d) => d.name)).toEqual(['Foo', null, 'Bar']);
  expect(defs.map((d) => d.typeString)).toEqual([
    'int',
    'string',
    'non-empty-string',
  ]);
}

function ignoresCommentsWithoutPhpstanType(): void {
  const defs = extractInputTypes('string /* note */ int');
  expect(defs).toHaveLength(2);
  expect(defs.map((d) => d.typeString)).toEqual(['string', 'int']);
}

function throwsWhenNoTypesFound(): void {
  expect(() => extractInputTypes('/** just a comment */')).toThrow(
    /No type definitions found/u,
  );
}

function throwsOnUnterminatedComment(): void {
  expect(() => extractInputTypes('/* @phpstan-type Foo int')).toThrow(
    /Unterminated comment/u,
  );
}

function throwsOnDuplicateAcrossComments(): void {
  const source = `/**
 * @phpstan-type Foo int
 */
/**
 * @phpstan-type Foo string
 */`;
  expect(() => extractInputTypes(source)).toThrow(
    expect.objectContaining({
      name: 'PhpstanTypeExtractError',
      message: 'Duplicate @phpstan-type alias "Foo"',
      pos: source.lastIndexOf('Foo'),
    }),
  );
}

function extractPhpstanTypesReturnsNamedOnly(): void {
  const defs = extractPhpstanTypes(POST_LIST_DOCBLOCK);
  expect(defs.every((d) => typeof d.name === 'string')).toBe(true);
  expect(defs).toHaveLength(3);
}

function extractPhpstanTypesThrowsWithoutAliases(): void {
  expect(() => extractPhpstanTypes('array<string>')).toThrow(
    /No @phpstan-type definitions found/u,
  );
}

function extractPhpstanTypesThrowsOnDuplicate(): void {
  const source = `/**
 * @phpstan-type Foo int
 * @phpstan-type Foo string
 */`;
  expect(() => extractPhpstanTypes(source)).toThrow(
    expect.objectContaining({
      name: 'PhpstanTypeExtractError',
      message: 'Duplicate @phpstan-type alias "Foo"',
      pos: source.lastIndexOf('Foo'),
    }),
  );
}

function extractPhpstanTypesThrowsWhenNameMissing(): void {
  expect(() => extractPhpstanTypes('/** @phpstan-type */')).toThrow(
    /Expected alias name/u,
  );
}

function extractPhpstanTypesThrowsWhenNameInvalid(): void {
  const source = '/** @phpstan-type <> int */';
  expect(() => extractPhpstanTypes(source)).toThrow(
    expect.objectContaining({
      name: 'PhpstanTypeExtractError',
      message: 'Invalid alias name in @phpstan-type: <> int',
      pos: source.indexOf('<>'),
    }),
  );
}

function extractPhpstanTypesThrowsWhenTypeMissing(): void {
  expect(() => extractPhpstanTypes('/** @phpstan-type Foo */')).toThrow(
    /Missing type definition/u,
  );
}

function extractPhpstanTypesIgnoresOtherTags(): void {
  const defs = extractPhpstanTypes(`/**
 * Some class.
 *
 * @todo refactor
 * @param string $x
 *
 * @phpstan-type Bar string
 */`);
  expect(defs).toHaveLength(1);
  expect(defs[0].name).toBe('Bar');
}

function formatsAliasDefinitionsAsPhpdocBlock(): void {
  const block = formatPhpstanTypeAliasesBlock([
    { name: 'PostSummary', typeString: 'array{id: int, title: string}' },
    {
      name: 'PostListResponse',
      typeString: 'array{posts: list<PostSummary>}',
    },
  ]);
  expect(block).toBe(`/**
 * @phpstan-type PostSummary array{id: int, title: string}
 * @phpstan-type PostListResponse array{posts: list<PostSummary>}
 */

`);
}

function returnsEmptyStringForNoAliases(): void {
  expect(formatPhpstanTypeAliasesBlock([])).toBe('');
}

function throwsPhpstanTypeExtractErrorType(): void {
  expect(() => extractInputTypes('')).toThrow(PhpstanTypeExtractError);
}

describe('extractInputTypes', () => {
  it('extracts post list API docblock types', extractsPostListApiDocblockTypes);
  it('extracts annotation docblock', extractsAnnotationDocblock);
  it('extracts single-line @phpstan-type', extractsSingleLinePhpstanType);
  it('extracts plain type expressions', extractsPlainTypeExpressions);
  it(
    'extracts multiple comments and plain types',
    extractsMultipleCommentsAndPlainTypes,
  );
  it(
    'ignores comments without @phpstan-type',
    ignoresCommentsWithoutPhpstanType,
  );
  it('throws when no types are found', throwsWhenNoTypesFound);
  it('throws on unterminated comment', throwsOnUnterminatedComment);
  it(
    'throws on duplicate alias names across comments',
    throwsOnDuplicateAcrossComments,
  );
});

describe('extractPhpstanTypes', () => {
  it('returns named aliases only', extractPhpstanTypesReturnsNamedOnly);
  it(
    'throws when no @phpstan-type tags are present',
    extractPhpstanTypesThrowsWithoutAliases,
  );
  it('throws on duplicate alias names', extractPhpstanTypesThrowsOnDuplicate);
  it('throws when alias name is missing', extractPhpstanTypesThrowsWhenNameMissing);
  it('throws when alias name is invalid', extractPhpstanTypesThrowsWhenNameInvalid);
  it('throws when type string is missing', extractPhpstanTypesThrowsWhenTypeMissing);
  it('ignores non-phpstan doc tags and prose', extractPhpstanTypesIgnoresOtherTags);
});

describe('formatPhpstanTypeAliasesBlock', () => {
  it(
    'formats alias definitions as a PHPDoc block',
    formatsAliasDefinitionsAsPhpdocBlock,
  );
  it('returns empty string for no aliases', returnsEmptyStringForNoAliases);
  it('throws PhpstanTypeExtractError type', throwsPhpstanTypeExtractErrorType);
});
