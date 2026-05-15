export interface TypeExample {
  label: string;
  type: string;
}

/** Built-in types for the UI examples dropdown. */
export const TYPE_EXAMPLES: readonly TypeExample[] = [
  { label: 'String map', type: 'array<string, string>' },
  { label: 'Union', type: 'int|string' },
  { label: 'List of int', type: 'list<int>' },
  { label: 'Shape (optional field)', type: 'array{foo: int, bar?: string}' },
  { label: 'Shape (required field)', type: 'array{hello: string}' },
  { label: 'Nullable array union', type: '(array<string|null,mixed>)|null' },
  { label: 'Callable', type: 'callable' },
  { label: 'Integer', type: 'int' },
];
