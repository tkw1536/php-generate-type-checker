import type { TypeNode } from '../../../parser/ast.ts';
import { formatType } from '../../../parser/format.ts';

/** Proposes a base PHP function name from a type (no cache or collision handling). */
export interface FunctionNameProposer {
  name(type: TypeNode): string;
}

export class IsStyleFunctionNameProposer implements FunctionNameProposer {
  name(type: TypeNode): string {
    return slugToIsName(formatType(type));
  }
}

export class SequentialCheckNameProposer implements FunctionNameProposer {
  private next = 0;

  name(_type: TypeNode): string {
    const counter = this.next++;
    return counter === 0 ? 'check' : `check_${counter}`;
  }
}

function slugToIsName(formatted: string): string {
  const parts = formatted.split(/[^a-zA-Z0-9]+/).filter((p) => p.length > 0);
  let slug = parts
    .map((p) => p[0].toUpperCase() + p.slice(1).toLowerCase())
    .join('');
  if (slug.length === 0) {
    slug = 'Type';
  }
  if (/^[0-9]/.test(slug)) {
    slug = `T${slug}`;
  }
  return `is${slug}`;
}

/** Map a @phpstan-type alias name to an `is{Name}` entry function name. */
export function aliasToIsName(aliasName: string): string {
  const base = aliasName.replace(/^\\+/, '').split('\\').pop() ?? aliasName;
  const slug = base.replace(/[^a-zA-Z0-9]+/g, '');
  if (slug.length === 0) {
    return 'isType';
  }
  const normalized =
    slug[0].toUpperCase() + slug.slice(1);
  const withPrefix = /^[0-9]/.test(normalized) ? `T${normalized}` : normalized;
  return `is${withPrefix}`;
}
