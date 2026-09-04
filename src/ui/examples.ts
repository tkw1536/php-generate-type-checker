export interface TypeExample {
  readonly label: string;
  readonly type: string;
}

/** Built-in types for the UI examples dropdown (primarily `@phpstan-type` docblocks). */
export const TYPE_EXAMPLES: readonly TypeExample[] = [
  {
    label: 'Paginated blog post list',
    type: `/**
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
 */`,
  },
  {
    label: 'Paginated list response',
    type: `/**
 * @phpstan-type PaginatedList array{items: list<array{id: int, title: string}>, total: int}
 */`,
  },
  {
    label: 'HTTP client configuration',
    type: `/**
 * @phpstan-type HttpClientConfig array{baseUrl: string, timeout?: positive-int, apiKey?: string}
 */`,
  },
  {
    label: 'User account record',
    type: `/**
 * @phpstan-type UserAccount array{id: positive-int, email: non-empty-string, name: string, updatedAt: int}
 */`,
  },
  {
    label: 'JSON:API resource document',
    type: `/**
 * @phpstan-type JsonApiResource array{data: array{id: string, type: string, attributes: array<string, mixed>}}
 */`,
  },
  {
    label: 'Webhook delivery payload',
    type: `/**
 * @phpstan-type WebhookDelivery array{event: string, deliveryId: string, payload: array<string, mixed>}
 */`,
  },
  {
    label: 'Authenticated session data',
    type: `/**
 * @phpstan-type SessionData array{userId: int, roles: list<string>, expiresAt: int}
 */`,
  },
  {
    label: 'Query parameters (plain type)',
    type: 'array<string, string>',
  },
  {
    label: 'Decoded JSON object (plain type)',
    type: 'array<string, mixed>',
  },
  {
    label: 'Two plain types',
    type: 'array<string>array<int>',
  },
];
