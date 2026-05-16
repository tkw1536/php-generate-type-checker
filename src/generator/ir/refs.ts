import type { ValueRef } from './types.ts';

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

function phpString(value: string): string {
  return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

function arrayIndexExpr(key: string | number): string {
  return typeof key === 'number' ? String(key) : phpString(key);
}

export function variableRef(name: string): ValueRef {
  return { kind: 'variable', name };
}

export function arrayAccessRef(base: string, key: string | number): ValueRef {
  return { kind: 'array_access', base, key };
}

export function propertyAccessRef(base: string, name: string): ValueRef {
  return { kind: 'property_access', base, name };
}

/** Render a {@link ValueRef} to a PHP lvalue path. */
export function renderValueRef(ref: ValueRef): string {
  switch (ref.kind) {
    case 'variable':
      return ref.name;
    case 'array_access':
      return `${ref.base}[${arrayIndexExpr(ref.key)}]`;
    case 'property_access': {
      if (PHP_RESERVED_OBJECT_PROPERTIES.has(ref.name)) {
        return `${ref.base}->{${phpString(ref.name)}}`;
      }
      return `${ref.base}->${ref.name}`;
    }
    default: {
      const _exhaustive: never = ref;
      return _exhaustive;
    }
  }
}
