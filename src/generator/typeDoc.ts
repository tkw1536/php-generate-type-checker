/**
 * Print a {@link TypeNode} as a single-line PHPStan-style type string for PHPDoc.
 */
import type { CallableParam, ShapeField, TypeNode } from '../parser/ast.ts';
import { normalizeNode, type ArrayNode } from './normalize.ts';

function flattenUnion(node: TypeNode): TypeNode[] {
  if (node.kind === 'union') {
    return node.types.flatMap(flattenUnion);
  }
  return [node];
}

/** Escapes a type string for safe use inside `/** … *\/` (one line). */
export function escapePhpdocTypeLine(type: string): string {
  return type.replace(/\*\//g, '* /');
}

function unionDocParts(node: TypeNode): string[] {
  const parts = flattenUnion(node).map((m) => formatTypeForPhpstanDocRaw(m));
  return [...parts].sort((a, b) => a.localeCompare(b));
}

function shapeFieldDoc(f: ShapeField, objectShape: boolean): string {
  const opt = f.optional ? '?' : '';
  let keyDoc: string;
  if (typeof f.key === 'number') {
    keyDoc = String(f.key);
  } else {
    const s = String(f.key);
    if (objectShape && /^[a-zA-Z_]\w*$/.test(s)) {
      keyDoc = s;
    } else {
      keyDoc = `'${s.replace(/'/g, "\\'")}'`;
    }
  }
  return `${keyDoc}${opt}: ${formatTypeForPhpstanDocRaw(f.type)}`;
}

function callableParamsDoc(params: CallableParam[]): string {
  return params
    .map((p) => {
      let s = '';
      if (p.variadic) {
        s += '...';
      }
      s += formatTypeForPhpstanDocRaw(p.type);
      return s;
    })
    .join(', ');
}

/** Single-line PHPStan type (normalized). */
export function formatTypeForPhpstanDocRaw(n: TypeNode): string {
  const node = normalizeNode(n);
  return formatTypeForPhpstanDocInner(node);
}

function formatIntRangeDoc(node: { min?: number; max?: number }): string {
  if (node.min === undefined && node.max === undefined) {
    return 'int';
  }
  const lo = node.min === undefined ? 'min' : String(node.min);
  const hi = node.max === undefined ? 'max' : String(node.max);
  return `int<${lo}, ${hi}>`;
}

function formatTypeForPhpstanDocInner(node: TypeNode): string {
  switch (node.kind) {
    case 'primitive':
      return node.name;
    case 'int_range':
      return formatIntRangeDoc(node);
    case 'literal': {
      const v = node.value;
      if (typeof v === 'string') {
        return `'${v.replace(/'/g, "\\'")}'`;
      }
      return JSON.stringify(v);
    }
    case 'class':
      return node.name;
    case 'unsupported':
      return node.raw;
    case 'array': {
      const an = node as ArrayNode;
      const v = formatTypeForPhpstanDocRaw(an.value);
      if (an.iterable) {
        if (an.key) {
          return `iterable<${formatTypeForPhpstanDocRaw(an.key)}, ${v}>`;
        }
        return `iterable<${v}>`;
      }
      if (an.key) {
        return `array<${formatTypeForPhpstanDocRaw(an.key)}, ${v}>`;
      }
      if (an.nonEmpty) {
        return `non-empty-array<${v}>`;
      }
      return `array<${v}>`;
    }
    case 'list':
      if (node.nonEmpty) {
        return `non-empty-list<${formatTypeForPhpstanDocRaw(node.element)}>`;
      }
      return `list<${formatTypeForPhpstanDocRaw(node.element)}>`;
    case 'shape': {
      const objectShape = Boolean(node.object);
      const inner = node.fields.map((f) => shapeFieldDoc(f, objectShape)).join(', ');
      return objectShape ? `object{${inner}}` : `array{${inner}}`;
    }
    case 'union':
      return unionDocParts(node).join('|');
    case 'intersection': {
      const parts = node.types
        .map((t) => formatTypeForPhpstanDocRaw(t))
        .sort((a, b) => a.localeCompare(b));
      return parts.join('&');
    }
    case 'generic':
      return `${node.name}<${node.typeArgs.map((t) => formatTypeForPhpstanDocRaw(t)).join(', ')}>`;
    case 'callable': {
      const s = node.signature;
      return `callable(${callableParamsDoc(s.params)}): ${formatTypeForPhpstanDocRaw(s.returnType)}`;
    }
    default:
      return 'mixed';
  }
}

/**
 * Format normalized type for `@phpstan-assert-if-true … $value` (single line, no comment delimiters).
 */
export function formatTypeForPhpstanDoc(node: TypeNode): string {
  return escapePhpdocTypeLine(formatTypeForPhpstanDocRaw(normalizeNode(node)));
}
