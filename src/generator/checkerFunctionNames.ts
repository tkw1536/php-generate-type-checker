/**
 * Deterministic checker function names: `is` + readable PascalCase slug from normalized types.
 */
import type { ShapeField, TypeNode } from '../parser/ast.ts';
import { normalizeNode, type ArrayNode } from './normalize.ts';
import { typeDedupeKey } from './typeKey.ts';
import { sortFlattenedUnionMembers } from './unionOrder.ts';

/** Lowercase names that must not be used as a whole slug segment (PHP keywords / reserved). */
const RESERVED_WHOLE_SLUG = new Set(
  [
    'array',
    'list',
    'callable',
    'class',
    'false',
    'true',
    'null',
    'void',
    'static',
    'object',
    'iterable',
    'resource',
    'private',
    'public',
    'protected',
    'interface',
    'trait',
    'namespace',
    'use',
    'new',
    'var',
    'match',
    'fn',
  ].map((s) => s.toLowerCase()),
);

function shapeFieldSortKey(f: ShapeField): string {
  return `${String(f.key)}:${f.optional ? '1' : '0'}:${typeDedupeKey(f.type)}`;
}

function primitiveToPascal(name: string): string {
  return name
    .split('-')
    .filter((s) => s.length > 0)
    .map((seg) => seg[0]!.toUpperCase() + seg.slice(1).toLowerCase())
    .join('');
}

function classNameToSlug(name: string): string {
  const parts = name.split('\\').filter((s) => s.length > 0);
  const last = parts[parts.length - 1] ?? 'Class';
  return last
    .replace(/[^a-zA-Z0-9_]/g, '_')
    .split('_')
    .filter((p) => p.length > 0)
    .map((p) => p[0]!.toUpperCase() + p.slice(1))
    .join('');
}

function literalSlug(node: Extract<TypeNode, { kind: 'literal' }>): string {
  if (typeof node.value === 'number') {
    const s = String(node.value);
    const safe = s.replace(/[^0-9eE+-]/g, 'x');
    return `LitNum${safe}`;
  }
  if (typeof node.value === 'boolean') {
    return node.value ? 'LitTrue' : 'LitFalse';
  }
  const str = node.value as string;
  const alnum = str.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 24);
  return `LitStr${str.length}${alnum ? '_' + alnum : ''}`;
}

function shortHash(input: string): string {
  let h = 0;
  for (let i = 0; i < input.length; i++) {
    h = (Math.imul(31, h) + input.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(16).slice(0, 8);
}

function escapeReservedWholeSlug(pascal: string): string {
  if (RESERVED_WHOLE_SLUG.has(pascal.toLowerCase())) {
    return `${pascal}Type`;
  }
  return pascal;
}

/**
 * Readable PascalCase identifier (no `is` prefix) from a **normalized** {@link TypeNode}.
 */
export function typeToPascalSlug(node: TypeNode): string {
  const n = normalizeNode(node);
  switch (n.kind) {
    case 'primitive':
      return escapeReservedWholeSlug(primitiveToPascal(n.name));
    case 'int_range': {
      let s = 'Int';
      if (n.min !== undefined) {
        s += n.min >= 0 ? `Ge${n.min}` : `GeNeg${-n.min}`;
      }
      if (n.max !== undefined) {
        s += n.max >= 0 ? `Le${n.max}` : `LeNeg${-n.max}`;
      }
      return s;
    }
    case 'literal':
      return literalSlug(n);
    case 'class':
      return escapeReservedWholeSlug(classNameToSlug(n.name));
    case 'array': {
      const an = n as ArrayNode;
      const family = an.iterable ? 'Iterable' : 'Array';
      const ne = an.nonEmpty ? 'NonEmpty' : '';
      const vs = typeToPascalSlug(an.value);
      if (an.key) {
        return `${ne}${family}${typeToPascalSlug(an.key)}To${vs}`;
      }
      return `${ne}${family}${vs}`;
    }
    case 'list': {
      const inner = typeToPascalSlug(n.element);
      return n.nonEmpty ? `NonEmptyList${inner}` : `List${inner}`;
    }
    case 'shape': {
      const fields = [...n.fields].sort((a, b) =>
        shapeFieldSortKey(a).localeCompare(shapeFieldSortKey(b)),
      );
      const parts = fields.map((f) => {
        const keySeg =
          typeof f.key === 'number'
            ? `N${f.key}`
            : String(f.key).replace(/[^a-zA-Z0-9_]/g, '_');
        const o = f.optional ? 'Opt' : 'Req';
        return `Fld${keySeg}${o}${typeToPascalSlug(f.type)}`;
      });
      const prefix = n.object ? 'ObjectShape' : 'Shape';
      return `${prefix}${parts.join('')}`;
    }
    case 'union': {
      const members = sortFlattenedUnionMembers(n);
      return members.map(typeToPascalSlug).join('Or');
    }
    case 'intersection': {
      const parts = [...n.types]
        .map((t) => normalizeNode(t))
        .sort((a, b) => typeDedupeKey(a).localeCompare(typeDedupeKey(b)))
        .map(typeToPascalSlug);
      return parts.join('And');
    }
    case 'generic': {
      const args = n.typeArgs.map((t) => typeToPascalSlug(normalizeNode(t))).join('');
      return `Generic${primitiveToPascal(n.name)}${args}`;
    }
    case 'callable':
      return `Callable${shortHash(typeDedupeKey(n))}`;
    case 'unsupported': {
      return `Unsupported${shortHash(n.raw + (n.reason ?? ''))}`;
    }
    default:
      return `Node${shortHash(typeDedupeKey(n))}`;
  }
}

export function toIsFunctionIdentifier(pascalSlug: string): string {
  const core = escapeReservedWholeSlug(
    pascalSlug.replace(/[^A-Za-z0-9_]/g, ''),
  );
  let ident = core.length > 0 ? core : 'Type';
  if (/^[0-9]/.test(ident)) {
    ident = `T${ident}`;
  }
  return `is${ident[0]!.toUpperCase()}${ident.slice(1)}`;
}

/**
 * Allocates unique `is*` names per {@link typeDedupeKey}, avoiding collisions with reserved names.
 */
export class CheckerFunctionNameRegistry {
  private readonly assigned = new Map<string, string>();
  private readonly used = new Set<string>();

  constructor(reservedNames: Iterable<string> = []) {
    for (const r of reservedNames) {
      this.used.add(r);
    }
  }

  allocate(dedupeKey: string, node: TypeNode): string {
    const existing = this.assigned.get(dedupeKey);
    if (existing !== undefined) {
      return existing;
    }
    const base = toIsFunctionIdentifier(typeToPascalSlug(node));
    let candidate = base;
    let n = 2;
    while (this.used.has(candidate)) {
      candidate = `${base}_${n}`;
      n++;
    }
    this.used.add(candidate);
    this.assigned.set(dedupeKey, candidate);
    return candidate;
  }
}
