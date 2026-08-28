import { describe, expect, it } from 'vitest';
import { parseType } from './parser.ts';
import {
  parsePhpstanTypesFromDocblock,
  TypeAliasResolveError,
  unresolvedAliasReferences,
} from './resolveTypeAliases.ts';

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
  it('resolves forward references between aliases', () => {
    const defs = parsePhpstanTypesFromDocblock(FORWARD_REF_DOCBLOCK);
    expect(defs).toHaveLength(2);
    const outer = defs.find((d) => d.name === 'Outer')!;
    expect(unresolvedAliasReferences(outer.ast, ['Inner', 'Outer'])).toEqual([]);
    expect(outer.ast).toEqual(
      parseType('array{inner: int}'),
    );
  });

  it('resolves post list cross-references', () => {
    const defs = parsePhpstanTypesFromDocblock(POST_LIST_DOCBLOCK);
    const response = defs.find((d) => d.name === 'PostListResponse')!;
    expect(
      unresolvedAliasReferences(response.ast, defs.map((d) => d.name)),
    ).toEqual([]);
    expect(response.ast.kind).toBe('shape');
  });

  it('resolves annotation intersection shapes without bare alias class nodes', () => {
    const defs = parsePhpstanTypesFromDocblock(ANNOTATION_DOCBLOCK);
    const input = defs.find((d) => d.name === 'AnnotationInput')!;
    expect(
      unresolvedAliasReferences(input.ast, defs.map((d) => d.name)),
    ).toEqual([]);
    expect(input.ast.kind).toBe('intersection');
  });

  it('preserves real class names with leading backslash', () => {
    const defs = parsePhpstanTypesFromDocblock(ANNOTATION_DOCBLOCK);
    const body = defs.find((d) => d.name === 'AnnotationBody')!;
    const intersection = body.ast as Extract<typeof body.ast, { kind: 'intersection' }>;
    expect(intersection.types[0]).toEqual({ kind: 'class', name: '\\stdClass' });
    const shape = intersection.types[1] as Extract<
      typeof intersection.types[1],
      { kind: 'shape' }
    >;
    const elementsField = shape.fields.find((f) => f.key === 'elements');
    expect(elementsField?.value).toEqual({
      kind: 'collection',
      keyword: 'list',
      value: { kind: 'class', name: '\\DOMElement' },
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
