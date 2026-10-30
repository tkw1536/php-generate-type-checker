/**
 * PHP value AST for type examples (not checker IR).
 * Rendered with single-quoted strings and short array syntax.
 */
export type PhpValue =
  | { readonly kind: 'null' }
  | { readonly kind: 'bool'; readonly value: boolean }
  | { readonly kind: 'int'; readonly value: number }
  | { readonly kind: 'float'; readonly value: number }
  | { readonly kind: 'string'; readonly value: string }
  | { readonly kind: 'array'; readonly elements: readonly PhpArrayElement[] }
  | {
      readonly kind: 'objectCast';
      readonly elements: readonly PhpArrayElement[];
    };

export type PhpArrayElement =
  | { readonly kind: 'value'; readonly value: PhpValue }
  | { readonly kind: 'entry'; readonly key: PhpValue; readonly value: PhpValue };

export function phpNull(): PhpValue {
  return { kind: 'null' };
}

export function phpBool(value: boolean): PhpValue {
  return { kind: 'bool', value };
}

export function phpInt(value: number): PhpValue {
  return { kind: 'int', value };
}

export function phpFloat(value: number): PhpValue {
  return { kind: 'float', value };
}

export function phpString(value: string): PhpValue {
  return { kind: 'string', value };
}

export function phpList(values: readonly PhpValue[]): PhpValue {
  return {
    kind: 'array',
    elements: values.map((value) => ({ kind: 'value' as const, value })),
  };
}

export function phpMap(
  entries: readonly (readonly [PhpValue, PhpValue])[],
): PhpValue {
  return {
    kind: 'array',
    elements: entries.map(([key, value]) => ({
      kind: 'entry' as const,
      key,
      value,
    })),
  };
}

/** `(object)[…]` cast; elements match array entry/value shape. */
export function phpObjectCast(
  elements: readonly PhpArrayElement[] = [],
): PhpValue {
  return { kind: 'objectCast', elements };
}

/** Wrap an array value as `(object)[…]`. */
export function phpObjectFromArray(
  value: Extract<PhpValue, { readonly kind: 'array' }>,
): PhpValue {
  return phpObjectCast(value.elements);
}
