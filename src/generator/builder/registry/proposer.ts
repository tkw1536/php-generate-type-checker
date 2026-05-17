import type { ShapeField, TypeNode } from '../../../parser/ast.ts';
import { formatType } from '../../../parser/format.ts';
import {
  isIterableKeyword,
  isListKeyword,
  isNonEmptyKeyword,
  shapeIsObject,
} from '../collection.ts';
import { sortFlattenedUnionMembers } from '../union.ts';

/** Proposes a base PHP function name from a type (no cache or collision handling). */
export interface FunctionNameProposer {
  name(type: TypeNode): string;
}

export class IsStyleFunctionNameProposer implements FunctionNameProposer {
  name(type: TypeNode): string {
    return toIsFunctionIdentifier(typeToPascalSlug(type));
  }
}

export class SequentialCheckNameProposer implements FunctionNameProposer {
  private next = 1;

  name(_type: TypeNode): string {
    return `check_${this.next++}`;
  }
}

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
  return `${String(f.key)}:${f.optional ? '1' : '0'}:${formatType(f.value)}`;
}

function keywordToPascal(keyword: string): string {
  return keyword
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
  if (node.type === 'number') {
    const safe = node.value.replace(/[^0-9eE+-]/g, 'x');
    return `LitNum${safe}`;
  }
  const alnum = node.value.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 24);
  return `LitStr${node.value.length}${alnum ? '_' + alnum : ''}`;
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

function collectionFamilySlug(keyword: string): string {
  if (isListKeyword(keyword as never)) {
    return 'List';
  }
  if (isIterableKeyword(keyword as never)) {
    return 'Iterable';
  }
  return 'Array';
}

function collectionSlug(node: Extract<TypeNode, { kind: 'collection' }>): string {
  const ne = isNonEmptyKeyword(node.keyword) ? 'NonEmpty' : '';
  const family = collectionFamilySlug(node.keyword);

  if ('key' in node) {
    return `${ne}${family}${typeToPascalSlug(node.key)}To${typeToPascalSlug(node.value)}`;
  }
  if ('value' in node) {
    return `${ne}${family}${typeToPascalSlug(node.value)}`;
  }
  const parts = node.values.map(typeToPascalSlug).join('And');
  if (isListKeyword(node.keyword)) {
    return `${ne}${family}${parts}`;
  }
  return `${ne}${family}Tuple${parts}`;
}

function typeToPascalSlug(node: TypeNode): string {
  switch (node.kind) {
    case 'keyword':
      return escapeReservedWholeSlug(keywordToPascal(node.keyword));
    case 'range': {
      let s = 'Int';
      if (node.min !== null) {
        s += node.min >= 0 ? `Ge${node.min}` : `GeNeg${-node.min}`;
      }
      if (node.max !== null) {
        s += node.max >= 0 ? `Le${node.max}` : `LeNeg${-node.max}`;
      }
      return s;
    }
    case 'literal':
      return literalSlug(node);
    case 'class':
      return escapeReservedWholeSlug(classNameToSlug(node.name));
    case 'collection':
      return collectionSlug(node);
    case 'array':
      return `PostfixArray${typeToPascalSlug(node.value)}`;
    case 'shape': {
      const fields = [...node.fields].sort((a, b) =>
        shapeFieldSortKey(a).localeCompare(shapeFieldSortKey(b)),
      );
      const parts = fields.map((f) => {
        const keySeg =
          typeof f.key === 'number'
            ? `N${f.key}`
            : String(f.key).replace(/[^a-zA-Z0-9_]/g, '_');
        const o = f.optional ? 'Opt' : 'Req';
        return `Fld${keySeg}${o}${typeToPascalSlug(f.value)}`;
      });
      const prefix = shapeIsObject(node) ? 'ObjectShape' : 'Shape';
      return `${prefix}${parts.join('')}`;
    }
    case 'union': {
      const members = sortFlattenedUnionMembers(node);
      return members.map(typeToPascalSlug).join('Or');
    }
    case 'intersection': {
      const parts = [...node.types]
        .sort((a, b) => formatType(a).localeCompare(formatType(b)))
        .map(typeToPascalSlug);
      return parts.join('And');
    }
    case 'generic': {
      const args = node.typeArgs.map((t) => typeToPascalSlug(t)).join('');
      return `Generic${keywordToPascal(node.name)}${args}`;
    }
    case 'callable':
      return `Callable${shortHash(formatType(node))}`;
    case 'unsupported': {
      return `Unsupported${shortHash(node.raw + (node.reason ?? ''))}`;
    }
    default:
      return `Node${shortHash(formatType(node))}`;
  }
}

function toIsFunctionIdentifier(pascalSlug: string): string {
  const core = escapeReservedWholeSlug(
    pascalSlug.replace(/[^A-Za-z0-9_]/g, ''),
  );
  let ident = core.length > 0 ? core : 'Type';
  if (/^[0-9]/.test(ident)) {
    ident = `T${ident}`;
  }
  return `is${ident[0]!.toUpperCase()}${ident.slice(1)}`;
}
