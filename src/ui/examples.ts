export interface TypeExample {
  label: string;
  type: string;
}

/** Built-in types for the UI examples dropdown (common PHPStan shapes from APIs, config, and persistence). */
export const POST_LIST_DOCBLOCK_EXAMPLE = `/**
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

export const TYPE_EXAMPLES: readonly TypeExample[] = [
  {
    label: 'Paginated list response',
    type: 'array{items: list<array{id: int, title: string}>, total: int}',
  },
  {
    label: 'HTTP client config',
    type: 'array{baseUrl: string, timeout?: positive-int, apiKey?: string}',
  },
  {
    label: 'User account row',
    type: 'array{id: positive-int, email: non-empty-string, name: string, updatedAt: int}',
  },
  {
    label: 'JSON:API resource document',
    type: 'array{data: array{id: string, type: string, attributes: array<string, mixed>}}',
  },
  {
    label: 'Webhook envelope',
    type: 'array{event: string, deliveryId: string, payload: array<string, mixed>}',
  },
  {
    label: 'Session payload',
    type: 'array{userId: int, roles: list<string>, expiresAt: int}',
  },
  { label: 'Query or header map', type: 'array<string, string>' },
  { label: 'Decoded JSON object', type: 'array<string, mixed>' },
  { label: 'Route or query ID', type: 'int|string' },
  {
    label: 'Two sequential types (no separator)',
    type: 'array<string>array<int>',
  },
  {
    label: 'Post list API (docblock)',
    type: POST_LIST_DOCBLOCK_EXAMPLE,
  },
];
