import { describe, expect, it } from 'vitest';
import { parseType } from './parser.ts';
import type { TypeNode } from './ast.ts';
import {
  namedAliasReferences,
  parsePhpstanTypesFromDocblock,
  TypeAliasResolveError,
} from './resolveTypeAliases.ts';

function aliasNames(defs: readonly { readonly name: string }[]): string[] {
  return defs.map((d) => d.name);
}

function expectShape(
  node: TypeNode,
): Extract<TypeNode, { kind: 'shape' }> {
  expect(node.kind).toBe('shape');
  if (node.kind !== 'shape') {
    throw new Error('expected shape');
  }
  return node;
}

function expectIntersection(
  node: TypeNode,
): Extract<TypeNode, { kind: 'intersection' }> {
  expect(node.kind).toBe('intersection');
  if (node.kind !== 'intersection') {
    throw new Error('expected intersection');
  }
  return node;
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

function keepsForwardAliasReferencesAsNamed(): void {
  const defs = parsePhpstanTypesFromDocblock(FORWARD_REF_DOCBLOCK);
  expect(defs).toHaveLength(2);
  const outer = defs.find((d) => d.name === 'Outer')!;
  expect(namedAliasReferences(outer.ast, aliasNames(defs))).toEqual(['Inner']);
  expect(outer.ast).toEqual(parseType('array{inner: Inner}'));
}

function inlinesAliasCrossReferencesWhenResolveAliases(): void {
  const defs = parsePhpstanTypesFromDocblock(FORWARD_REF_DOCBLOCK, {
    resolveAliases: true,
  });
  const outer = defs.find((d) => d.name === 'Outer')!;
  expect(namedAliasReferences(outer.ast, aliasNames(defs))).toEqual([]);
  expect(outer.ast).toEqual(parseType('array{inner: int}'));
}

function keepsPostListCrossReferencesAsNamed(): void {
  const defs = parsePhpstanTypesFromDocblock(POST_LIST_DOCBLOCK);
  const response = defs.find((d) => d.name === 'PostListResponse')!;
  expect(namedAliasReferences(response.ast, defs.map((d) => d.name))).toEqual([
    'PaginationMeta',
    'PostSummary',
  ]);
  const shape = expectShape(response.ast);
  const postsField = shape.fields.find((f) => f.key === 'posts');
  expect(postsField?.value).toEqual({
    kind: 'collection',
    keyword: 'list',
    value: { kind: 'named', name: 'PostSummary' },
  });
}

function keepsAnnotationAliasReferencesAsNamed(): void {
  const defs = parsePhpstanTypesFromDocblock(ANNOTATION_DOCBLOCK);
  const input = defs.find((d) => d.name === 'AnnotationInput')!;
  expect(namedAliasReferences(input.ast, defs.map((d) => d.name))).toEqual([
    'AnnotationBody',
    'AnnotationTarget',
  ]);
  const intersection = expectIntersection(input.ast);
  const shapeNode = expectShape(intersection.types[1]);
  const bodyField = shapeNode.fields.find((f) => f.key === 'body');
  expect(bodyField?.value).toEqual({
    kind: 'named',
    name: 'AnnotationBody',
  });
}

function preservesRealClassNamesWithLeadingBackslash(): void {
  const defs = parsePhpstanTypesFromDocblock(ANNOTATION_DOCBLOCK);
  const body = defs.find((d) => d.name === 'AnnotationBody')!;
  const intersection = expectIntersection(body.ast);
  expect(intersection.types[0]).toEqual({
    kind: 'named',
    name: '\\stdClass',
  });
  const shapeNode = expectShape(intersection.types[1]);
  const elementsField = shapeNode.fields.find((f) => f.key === 'elements');
  expect(elementsField?.value).toEqual({
    kind: 'collection',
    keyword: 'list',
    value: { kind: 'named', name: '\\DOMElement' },
  });
}

function throwsOnCircularAliasReferences(): void {
  expect(() =>
    parsePhpstanTypesFromDocblock(`/**
 * @phpstan-type A B
 * @phpstan-type B A
 */`),
  ).toThrow(TypeAliasResolveError);
}

function attributesParseErrorsToAliasIndex(): void {
  expect(() =>
    parsePhpstanTypesFromDocblock(`/**
 * @phpstan-type Good int
 * @phpstan-type Bad array{
 */`),
  ).toThrow(expect.objectContaining({ expressionIndex: 1 }));
}

describe('parsePhpstanTypesFromDocblock', () => {
  it(
    'keeps forward alias references as named nodes',
    keepsForwardAliasReferencesAsNamed,
  );
  it(
    'inlines alias cross-references when resolveAliases is true',
    inlinesAliasCrossReferencesWhenResolveAliases,
  );
  it(
    'keeps post list cross-references as named nodes',
    keepsPostListCrossReferencesAsNamed,
  );
  it(
    'keeps annotation alias references as named nodes inside intersection shapes',
    keepsAnnotationAliasReferencesAsNamed,
  );
  it(
    'preserves real class names with leading backslash',
    preservesRealClassNamesWithLeadingBackslash,
  );
  it('throws on circular alias references', throwsOnCircularAliasReferences);
  it('attributes parse errors to alias index', attributesParseErrorsToAliasIndex);
});
