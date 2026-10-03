export interface TypeExample {
  readonly label: string;
  readonly type: string;
}

/**
 * Built-in types for the UI examples dropdown.
 * The first entry is the initial editor contents when the URL fragment has no type.
 */
export const TYPE_EXAMPLES: readonly TypeExample[] = [
  {
    label: 'User address',
    type: `/**
 * @phpstan-type UserAddress array{street: string, city: string, zip: string}
 */`,
  },
  {
    label: 'API success or failure',
    type: `/**
 * @phpstan-type ApiResult array{ok: true, data: mixed}|array{ok: false, error: non-empty-string}
 */`,
  },
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
    label: 'HTTP client configuration',
    type: `/**
 * @phpstan-type HttpClientConfig array{
 *   baseUrl: non-empty-string,
 *   timeout?: positive-int,
 *   apiKey?: non-empty-string
 * }
 */`,
  },
  {
    label: 'stdClass with object shape',
    type: `/**
 * @phpstan-type NamedEntity \\stdClass&object{id: positive-int, name: non-empty-string}
 */`,
  },
  {
    label: 'Authenticated session',
    type: `/**
 * @phpstan-type SessionData array{
 *   userId: positive-int,
 *   roles: non-empty-list<non-empty-string>,
 *   expiresAt: int
 * }
 */`,
  },
  {
    label: 'Query string map',
    type: 'array<string, string>',
  },
  {
    label: 'Two independent aliases',
    type: `/**
 * @phpstan-type UserId positive-int
 */
/**
 * @phpstan-type Slug non-empty-string
 */`,
  },
];
