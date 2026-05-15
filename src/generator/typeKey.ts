/**
 * Stable, canonical string keys for normalized {@link TypeNode} values so the same
 * logical type dedupes to one `check_N` helper (order of union members, etc.).
 */
import type { CallableParam, ShapeField, TypeNode } from '../parser/ast.ts';
import { normalizeNode, type ArrayNode } from './normalize.ts';

function flattenUnionTypes(node: TypeNode): TypeNode[] {
  if (node.kind === 'union') {
    return node.types.flatMap(flattenUnionTypes);
  }
  return [node];
}

function unionMemberSortKey(t: TypeNode): string {
  return canonicalTypeKeyNormalized(t);
}

/** Deterministic key for deduplicating helper bodies. */
export function typeDedupeKey(node: TypeNode): string {
  return canonicalTypeKeyNormalized(normalizeNode(node));
}

function canonicalTypeKeyNormalized(n: TypeNode): string {
  switch (n.kind) {
    case 'primitive':
      return `p:${n.name}`;
    case 'literal':
      return `l:${JSON.stringify(n.value)}`;
    case 'class':
      return `c:${n.name}`;
    case 'unsupported':
      return `u:${n.raw}:${n.reason ?? ''}`;
    case 'array': {
      const an = n as ArrayNode;
      const k = an.key ? canonicalTypeKeyNormalized(an.key) : '';
      const flags = `${an.nonEmpty ? '1' : '0'}${an.iterable ? '1' : '0'}`;
      return `a:${flags}:${k}:${canonicalTypeKeyNormalized(an.value)}`;
    }
    case 'list':
      return `ls:${n.nonEmpty ? '1' : '0'}:${canonicalTypeKeyNormalized(n.element)}`;
    case 'shape': {
      const parts = n.fields
        .map((f) => shapeFieldKey(f))
        .sort();
      return `sh:${n.sealed ? '1' : '0'}:${parts.join(',')}`;
    }
    case 'union': {
      const parts = flattenUnionTypes(n)
        .map((m) => unionMemberSortKey(m))
        .sort();
      return `or:${parts.join('|')}`;
    }
    case 'intersection': {
      const parts = n.types.map((t) => canonicalTypeKeyNormalized(t)).sort();
      return `and:${parts.join('&')}`;
    }
    case 'generic':
      return `g:${n.name}<${n.typeArgs.map((t) => canonicalTypeKeyNormalized(t)).join(',')}>`;
    case 'callable':
      return `fn:${callableSigKey(n.signature)}`;
    default:
      return `?:${String((n as { kind?: string }).kind)}`;
  }
}

function shapeFieldKey(f: ShapeField): string {
  return `${String(f.key)}:${f.optional ? '1' : '0'}:${canonicalTypeKeyNormalized(f.type)}`;
}

function callableSigKey(sig: { params: CallableParam[]; returnType: TypeNode }): string {
  const ps = sig.params
    .map(
      (p) =>
        `${p.optional ? 'o' : ''}${p.byRef ? 'r' : ''}${p.variadic ? 'v' : ''}${
          p.name ?? ''
        }:${canonicalTypeKeyNormalized(p.type)}`,
    )
    .join(';');
  return `(${ps})->${canonicalTypeKeyNormalized(sig.returnType)}`;
}
