export interface TypeExample {
  label: string;
  type: string;
}

/** Built-in types for the UI examples dropdown (common PHPStan shapes from APIs, config, and persistence). */
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
];
