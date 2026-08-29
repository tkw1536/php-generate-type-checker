import { describe, expect, it } from 'vitest';
import { parseType } from './parser.ts';
import {
  namedAliasReferences,
  parsePhpstanTypesFromDocblock,
  TypeAliasResolveError,
} from './resolveTypeAliases.ts';

function aliasNames(defs: { name: string }[]): string[] {
  return defs.map((d) => d.name);
}

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

const ANNOTATION_DOCBLOCK = `/**
 * @phpstan-type AnnotationBody \\stdClass&object{
 *   elements: list<\\DOMElement>,
 *   context?: mixed
 * }
 * @phpstan-type AnnotationTarget \\stdClass&object{
 *   ref?: list<string>,
 *   type?: string
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

const FORWARD_REF_DOCBLOCK = `/**
 * @phpstan-type Outer array{inner: Inner}
 * @phpstan-type Inner int
 */`;

describe('parsePhpstanTypesFromDocblock', () => {
  it('keeps forward alias references as named nodes', () => {
    const defs = parsePhpstanTypesFromDocblock(FORWARD_REF_DOCBLOCK);
    expect(defs).toHaveLength(2);
    const outer = defs.find((d) => d.name === 'Outer')!;
    expect(namedAliasReferences(outer.ast, aliasNames(defs))).toEqual([
      'Inner',
    ]);
    expect(outer.ast).toEqual(parseType('array{inner: Inner}'));
  });

  it('inlines alias cross-references when resolveAliases is true', () => {
    const defs = parsePhpstanTypesFromDocblock(FORWARD_REF_DOCBLOCK, {
      resolveAliases: true,
    });
    const outer = defs.find((d) => d.name === 'Outer')!;
    expect(namedAliasReferences(outer.ast, aliasNames(defs))).toEqual([]);
    expect(outer.ast).toEqual(parseType('array{inner: int}'));
  });

  it('keeps post list cross-references as named nodes', () => {
    const defs = parsePhpstanTypesFromDocblock(POST_LIST_DOCBLOCK);
    const response = defs.find((d) => d.name === 'PostListResponse')!;
    expect(namedAliasReferences(response.ast, defs.map((d) => d.name))).toEqual([
      'PaginationMeta',
      'PostSummary',
    ]);
    expect(response.ast.kind).toBe('shape');
    const postsField = (
      response.ast as Extract<typeof response.ast, { kind: 'shape' }>
    ).fields.find((f) => f.key === 'posts');
    expect(postsField?.value).toEqual({
      kind: 'collection',
      keyword: 'list',
      value: { kind: 'named', name: 'PostSummary' },
    });
  });

  it('keeps annotation alias references as named nodes inside intersection shapes', () => {
    const defs = parsePhpstanTypesFromDocblock(ANNOTATION_DOCBLOCK);
    const input = defs.find((d) => d.name === 'AnnotationInput')!;
    expect(namedAliasReferences(input.ast, defs.map((d) => d.name))).toEqual([
      'AnnotationBody',
      'AnnotationTarget',
    ]);
    expect(input.ast.kind).toBe('intersection');
    const intersection = input.ast as Extract<
      typeof input.ast,
      { kind: 'intersection' }
    >;
    const shape = intersection.types[1] as Extract<
      (typeof intersection.types)[number],
      { kind: 'shape' }
    >;
    const bodyField = shape.fields.find((f) => f.key === 'body');
    expect(bodyField?.value).toEqual({
      kind: 'named',
      name: 'AnnotationBody',
    });
  });

  it('preserves real class names with leading backslash', () => {
    const defs = parsePhpstanTypesFromDocblock(ANNOTATION_DOCBLOCK);
    const body = defs.find((d) => d.name === 'AnnotationBody')!;
    const intersection = body.ast as Extract<
      typeof body.ast,
      { kind: 'intersection' }
    >;
    expect(intersection.types[0]).toEqual({
      kind: 'named',
      name: '\\stdClass',
    });
    const shape = intersection.types[1] as Extract<
      typeof intersection.types[1],
      { kind: 'shape' }
    >;
    const elementsField = shape.fields.find((f) => f.key === 'elements');
    expect(elementsField?.value).toEqual({
      kind: 'collection',
      keyword: 'list',
      value: { kind: 'named', name: '\\DOMElement' },
    });
  });

  it('throws on circular alias references', () => {
    expect(() =>
      parsePhpstanTypesFromDocblock(`/**
 * @phpstan-type A B
 * @phpstan-type B A
 */`),
    ).toThrow(TypeAliasResolveError);
  });

  it('attributes parse errors to alias index', () => {
    expect(() =>
      parsePhpstanTypesFromDocblock(`/**
 * @phpstan-type Good int
 * @phpstan-type Bad array{
 */`),
    ).toThrow(expect.objectContaining({ expressionIndex: 1 }));
  });
});
