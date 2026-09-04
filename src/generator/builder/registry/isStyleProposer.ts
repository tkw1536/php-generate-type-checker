import type { TypeNode } from '../../../parser/ast.ts';
import { formatType } from '../../../parser/format.ts';
import type { FunctionNameProposer } from './types.ts';

export type { FunctionNameProposer } from './types.ts';

export class IsStyleFunctionNameProposer implements FunctionNameProposer {
  name(type: TypeNode): string {
    return slugToIsName(formatType(type));
  }
}

function slugToIsName(formatted: string): string {
  const parts = formatted.split(/[^a-zA-Z0-9]+/u).filter((p) => p.length > 0);
  let slug = parts
    .map((p) => p[0].toUpperCase() + p.slice(1).toLowerCase())
    .join('');
  if (slug.length === 0) {
    slug = 'Type';
  }
  if (/^[0-9]/u.test(slug)) {
    slug = `T${slug}`;
  }
  return `is${slug}`;
}

/** Map a @phpstan-type alias name to an `is{Name}` entry function name. */
export function aliasToIsName(aliasName: string): string {
  const base = aliasName.replace(/^\\+/u, '').split('\\').pop() ?? aliasName;
  const slug = base.replaceAll(/[^a-zA-Z0-9]+/gu, '');
  if (slug.length === 0) {
    return 'isType';
  }
  const normalized = slug[0].toUpperCase() + slug.slice(1);
  const withPrefix = /^[0-9]/u.test(normalized) ? `T${normalized}` : normalized;
  return `is${withPrefix}`;
}
