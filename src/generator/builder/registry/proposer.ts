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
  private next = 1;

  name(_type: TypeNode): string {
    return `check_${this.next++}`;
  }
}

function slugToIsName(formatted: string): string {
  const parts = formatted.split(/[^a-zA-Z0-9]+/).filter((p) => p.length > 0);
  let slug = parts
    .map((p) => p[0]!.toUpperCase() + p.slice(1).toLowerCase())
    .join('');
  if (slug.length === 0) {
    slug = 'Type';
  }
  if (/^[0-9]/.test(slug)) {
    slug = `T${slug}`;
  }
  return `is${slug}`;
}
