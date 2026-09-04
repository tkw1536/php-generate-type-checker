import type { ValueRef } from '../ir/types.ts';

const PHP_RESERVED_OBJECT_PROPERTIES = new Set([
  'class',
  'function',
  'public',
  'protected',
  'private',
  'static',
  'abstract',
  'final',
  'interface',
  'trait',
  'extends',
  'implements',
  'namespace',
  'use',
  'const',
  'var',
  'new',
  'clone',
  'instanceof',
  'insteadof',
  'as',
  'try',
  'catch',
  'finally',
  'throw',
  'if',
  'else',
  'elseif',
  'switch',
  'case',
  'default',
  'break',
  'continue',
  'return',
  'yield',
  'match',
  'enum',
]);

function phpQuotedString(value: string): string {
  return `'${value.replaceAll('\\', '\\\\').replaceAll('\'', "\\'")}'`;
}

function arrayIndexExpr(key: string | number): string {
  return typeof key === 'number' ? String(key) : phpQuotedString(key);
}

/** PHP literal for a shape key in `array_key_exists` / `property_exists` args. */
export function phpStringLiteral(key: string | number): string {
  if (typeof key === 'number') {
    return String(key);
  }
  return phpQuotedString(key);
}

function renderObjectOperand(ref: ValueRef): string {
  if (ref.kind === 'variable') {
    return ref.name;
  }
  return `(${renderValueRef(ref)})`;
}

/** Render a {@link ValueRef} to a PHP lvalue path. */
export function renderValueRef(ref: ValueRef): string {
  switch (ref.kind) {
    case 'variable':
      return ref.name;
    case 'array_access':
      return `${renderObjectOperand(ref.object)}[${arrayIndexExpr(ref.key)}]`;
    case 'property_access': {
      const object = renderObjectOperand(ref.object);
      if (PHP_RESERVED_OBJECT_PROPERTIES.has(ref.name)) {
        return `${object}->{${phpQuotedString(ref.name)}}`;
      }
      return `${object}->${ref.name}`;
    }
    default: {
      const exhaustive: never = ref;
      return exhaustive;
    }
  }
}
