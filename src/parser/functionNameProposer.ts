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
      .map((part) => FunctionNameProposer.capitalizePart(part))
      .join('');
    if (slug.length === 0) {
      slug = 'Type';
    }
    if (/^[0-9]/u.test(slug)) {
      slug = `T${slug}`;
    }
    return `is${slug}`;
  }

  /**
   * Uppercase the first letter; keep the rest of the segment's spelling
   * (do not force the remainder to lowercase, so `MyClass` stays `MyClass`).
   * Formatted constants `TRUE`/`FALSE`/`NULL` become Title case for `isTrue` etc.
   */
  private static capitalizePart(part: string): string {
    if (part === 'TRUE' || part === 'FALSE' || part === 'NULL') {
      return part[0] + part.slice(1).toLowerCase();
    }
    return part[0].toUpperCase() + part.slice(1);
  }
}
