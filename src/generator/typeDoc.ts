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

function shapeFieldDoc(f: ShapeField): string {
  const opt = f.optional ? '?' : '';
  const key =
    typeof f.key === 'number' ? String(f.key) : `'${String(f.key).replace(/'/g, "\\'")}'`;
  return `${key}${opt}: ${formatTypeForPhpstanDocRaw(f.type)}`;
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

function formatTypeForPhpstanDocRaw(n: TypeNode): string {
  const node = normalizeNode(n);
  return formatTypeForPhpstanDocInner(node);
}

function formatTypeForPhpstanDocInner(node: TypeNode): string {
  switch (node.kind) {
    case 'primitive':
      return node.name;
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
      return `list<${formatTypeForPhpstanDocRaw(node.element)}>`;
    case 'shape': {
      const inner = node.fields.map((f) => shapeFieldDoc(f)).join(', ');
      return `array{${inner}}`;
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
