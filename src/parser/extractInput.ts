import type { PhpstanTypeDef } from './phpstanTypeDocblock.ts';
import {
  PhpstanTypeExtractError,
  extractPhpstanTypesFromComment,
} from './phpstanTypeDocblock.ts';
import { parseTypes } from './parser.ts';

/** One type from mixed plain / `@phpstan-type` input before AST parse. */
export type InputTypeEntry = {
  /** Alias from `@phpstan-type`, or `null` for plain type expressions. */
  readonly name: string | null;
  readonly typeString: string;
  /** Absolute start of {@link typeString} in the original source (parse error base). */
  readonly typeStart: number;
  readonly start: number;
  readonly end: number;
};

/**
 * Scan source for block comments and plain type regions.
 * Named entries come from `@phpstan-type`; plain juxtaposition yields unnamed entries.
 */
export function extractInputTypes(source: string): InputTypeEntry[] {
  const seenNames = new Set<string>();
  const parts: (readonly InputTypeEntry[])[] = [];
  let i = 0;
  let plainStart = 0;

  while (i < source.length) {
    if (source[i] === '/' && source[i + 1] === '*') {
      parts.push(plainEntriesFromRegion(source.slice(plainStart, i), plainStart));
      const close = source.indexOf('*/', i + 2);
      if (close === -1) {
        throw new PhpstanTypeExtractError('Unterminated comment', i);
      }
      const commentEnd = close + 2;
      const fromComment = extractPhpstanTypesFromComment(
        source.slice(i, commentEnd),
        i,
        seenNames,
      );
      parts.push(
        fromComment.map((def) => ({
          name: def.name,
          typeString: def.typeString,
          typeStart: def.typeStart,
          start: def.start,
          end: def.end,
        })),
      );
      i = commentEnd;
      plainStart = i;
      continue;
    }
    i++;
  }

  parts.push(plainEntriesFromRegion(source.slice(plainStart), plainStart));
  const entries = parts.flat();

  if (entries.length === 0) {
    throw new PhpstanTypeExtractError('No type definitions found', 0);
  }

  return entries;
}

/** Named `@phpstan-type` aliases only (drops plain type expressions). */
export function extractPhpstanTypes(source: string): PhpstanTypeDef[] {
  const named = extractInputTypes(source).filter(
    (entry): entry is InputTypeEntry & { readonly name: string } =>
      entry.name !== null,
  );
  if (named.length === 0) {
    throw new PhpstanTypeExtractError(
      'No @phpstan-type definitions found',
      0,
    );
  }
  return named.map((entry) => ({
    name: entry.name,
    typeString: entry.typeString,
    typeStart: entry.typeStart,
    start: entry.start,
    end: entry.end,
  }));
}

function plainEntriesFromRegion(
  region: string,
  regionStart: number,
): readonly InputTypeEntry[] {
  const lead = region.length - region.trimStart().length;
  const trimmed = region.trim();
  if (trimmed === '') {
    return [];
  }
  const absoluteTrimStart = regionStart + lead;
  const parsed = parseTypes(trimmed);
  return parsed.segments.map((segment) => {
    const segmentText = parsed.source.slice(segment.start, segment.end);
    const trimLead = segmentText.length - segmentText.trimStart().length;
    const typeString = segmentText.trim();
    return {
      name: null,
      typeString,
      typeStart: absoluteTrimStart + segment.start + trimLead,
      start: absoluteTrimStart + segment.start,
      end: absoluteTrimStart + segment.end,
    };
  });
}
