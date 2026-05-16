/** Opaque PHP source for a shape/array key (wrap with {@link literalArg} in ir). */
export function phpLiteralKey(key: string | number): string {
  if (typeof key === 'number') {
    return String(key);
  }
  return `'${key.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

/** Opaque PHP source for a scalar literal (wrap with {@link literalArg} in ir). */
export function phpLiteralScalar(value: string | number | boolean): string | null {
  if (typeof value === 'string') {
    return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
  }
  if (typeof value === 'number') {
    return String(value);
  }
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }
  return null;
}
