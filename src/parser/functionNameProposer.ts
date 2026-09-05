import type { TypeNode } from './ast.ts';
import { formatType } from './format.ts';

/** Proposes a base PHP function name from a type (no cache or collision handling). */
export class FunctionNameProposer {
  name(type: TypeNode): string {
    return FunctionNameProposer.slugToIsName(formatType(type));
  }

  private static slugToIsName(formatted: string): string {
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
}
