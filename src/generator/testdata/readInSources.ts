import { readFileSync } from 'node:fs';

/** One non-comment `.IN` source line with optional RequireClass metadata. */
export type InSourceLine = {
  readonly input: string;
  readonly requireClass: readonly string[];
};

const REQUIRE_CLASS_RE = /\s#\s*RequireClass:\s*(.*)$/u;

/**
 * Parse a single `.IN` line: strip trailing `# RequireClass: A, B`.
 * Returns null for blanks and full-line `#` comments.
 */
export function parseInSourceLine(line: string): InSourceLine | null {
  const trimmed = line.trim();
  if (trimmed.length === 0 || trimmed.startsWith('#')) {
    return null;
  }
  const match = REQUIRE_CLASS_RE.exec(trimmed);
  if (match === null) {
    return { input: trimmed, requireClass: [] };
  }
  const input = trimmed.slice(0, match.index).trimEnd();
  const raw = match[1] ?? '';
  const requireClass = raw
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  return { input, requireClass };
}

/** Non-empty, non-comment lines from a generator `.IN` list. */
export function readInSources(inPath: string): readonly string[] {
  return readInSourceLines(inPath).map((line) => line.input);
}

/** Like {@link readInSources} but keeps `# RequireClass:` metadata. */
export function readInSourceLines(inPath: string): readonly InSourceLine[] {
  const out: InSourceLine[] = [];
  for (const line of readFileSync(inPath, 'utf8').split('\n')) {
    const parsed = parseInSourceLine(line);
    if (parsed !== null) {
      out.push(parsed);
    }
  }
  return out;
}
