import { readFileSync } from 'node:fs';

/** Non-empty, non-comment lines from a generator `.IN` list. */
export function readInSources(inPath: string): readonly string[] {
  return readFileSync(inPath, 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'));
}
