import type { PhpArrayElement, PhpValue } from './phpValue.ts';

/** Render a PHP value expression (single quotes, short arrays). */
export function renderPhpValue(value: PhpValue): string {
  switch (value.kind) {
    case 'null':
      return 'null';
    case 'bool':
      return value.value ? 'true' : 'false';
    case 'int':
      return renderInt(value.value);
    case 'float':
      return renderFloat(value.value);
    case 'string':
      return renderSingleQuoted(value.value);
    case 'array':
      return renderArray(value.elements);
    case 'objectCast':
      return `(object)${renderArray(value.elements)}`;
    default:
      throw new Error('never reached');
  }
}

function renderInt(value: number): string {
  if (!Number.isInteger(value)) {
    throw new TypeError(`php int example is not an integer: ${value}`);
  }
  return String(value);
}

function renderFloat(value: number): string {
  if (!Number.isFinite(value)) {
    throw new TypeError(`php float example is not finite: ${value}`);
  }
  // Keep a decimal so PHPStan/PHP see a float, not an int.
  const text = String(value);
  return text.includes('.') || text.includes('e') || text.includes('E')
    ? text
    : `${text}.0`;
}

/** PHP single-quoted string literal. */
export function renderSingleQuoted(value: string): string {
  return `'${value.replaceAll('\\', '\\\\').replaceAll("'", "\\'")}'`;
}

function renderArray(elements: readonly PhpArrayElement[]): string {
  if (elements.length === 0) {
    return '[]';
  }
  const parts = elements.map((el) => {
    if (el.kind === 'value') {
      return renderPhpValue(el.value);
    }
    return `${renderPhpValue(el.key)} => ${renderPhpValue(el.value)}`;
  });
  return `[${parts.join(', ')}]`;
}
