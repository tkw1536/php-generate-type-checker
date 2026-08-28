import { describe, expect, it } from 'vitest';
import {
  extractPhpstanTypes,
  formatPhpstanTypeAliasesBlock,
  isDocblockInput,
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

describe('isDocblockInput', () => {
  it('returns true when input starts with /* after trim', () => {
    expect(isDocblockInput('  /**\n * @phpstan-type Foo int\n */')).toBe(true);
    expect(isDocblockInput('/* @phpstan-type Foo int */')).toBe(true);
  });

  it('returns false for plain type expressions', () => {
    expect(isDocblockInput('array<string>')).toBe(false);
    expect(isDocblockInput('string /* comment */')).toBe(false);
  });
});

describe('extractPhpstanTypes', () => {
  it('extracts post list API docblock types', () => {
    const defs = extractPhpstanTypes(POST_LIST_DOCBLOCK);
    expect(defs).toHaveLength(3);
    expect(defs.map((d) => d.name)).toEqual([
      'PostSummary',
      'PaginationMeta',
      'PostListResponse',
    ]);
    expect(defs[0]!.typeString).toBe(
      'array{ id: positive-int, slug: non-empty-string, title: string }',
    );
    expect(defs[2]!.typeString).toBe(
      'array{ posts: list<PostSummary>, meta: PaginationMeta }',
    );
  });

  it('extracts annotation docblock with multiline intersections', () => {
    const defs = extractPhpstanTypes(ANNOTATION_DOCBLOCK);
    expect(defs).toHaveLength(4);
    expect(defs.map((d) => d.name)).toEqual([
      'AnnotationBody',
      'AnnotationTarget',
      'AnnotationInput',
      'Annotation',
    ]);
    expect(defs[0]!.typeString).toContain('\\stdClass&object{');
    expect(defs[0]!.typeString).toContain('list<\\DOMElement>');
    expect(defs[2]!.typeString).toContain('body: AnnotationBody');
  });

  it('extracts single-line @phpstan-type', () => {
    const defs = extractPhpstanTypes('/** @phpstan-type Foo int */');
    expect(defs).toEqual([
      expect.objectContaining({ name: 'Foo', typeString: 'int' }),
    ]);
  });

  it('ignores non-phpstan doc tags and prose', () => {
    const defs = extractPhpstanTypes(`/**
 * Some class.
 *
 * @todo refactor
 * @param string $x
 *
 * @phpstan-type Bar string
 */`);
    expect(defs).toHaveLength(1);
    expect(defs[0]!.name).toBe('Bar');
  });

  it('throws when input is not a docblock', () => {
    expect(() => extractPhpstanTypes('array<string>')).toThrow(
      PhpstanTypeExtractError,
    );
  });

  it('throws when no @phpstan-type tags are present', () => {
    expect(() => extractPhpstanTypes('/** just a comment */')).toThrow(
      /No @phpstan-type definitions/,
    );
  });

  it('throws on duplicate alias names', () => {
    expect(() =>
      extractPhpstanTypes(`/**
 * @phpstan-type Foo int
 * @phpstan-type Foo string
 */`),
    ).toThrow(/Duplicate @phpstan-type alias "Foo"/);
  });

  it('throws when alias name is missing', () => {
    expect(() => extractPhpstanTypes('/** @phpstan-type */')).toThrow(
      /Expected alias name/,
    );
  });

  it('throws when type string is missing', () => {
    expect(() => extractPhpstanTypes('/** @phpstan-type Foo */')).toThrow(
      /Missing type definition/,
    );
  });
});

describe('formatPhpstanTypeAliasesBlock', () => {
  it('formats alias definitions as a PHPDoc block', () => {
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
  });

  it('returns empty string for no aliases', () => {
    expect(formatPhpstanTypeAliasesBlock([])).toBe('');
  });
});
