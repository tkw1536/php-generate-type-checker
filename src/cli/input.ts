import { readFileSync } from 'node:fs';
import process from 'node:process';
import { CliUsageError } from './args.ts';

/**
 * Resolve CLI input to a single source string.
 * Positionals are one type per argument (joined with newlines).
 * `--file -` reads STDIN.
 */
export function readCliInput(options: {
  readonly file: string | undefined;
  readonly types: readonly string[];
}): Promise<string> {
  if (options.file !== undefined) {
    return readFileOrStdin(options.file);
  }
  if (options.types.length === 0) {
    return Promise.reject(
      new CliUsageError('No input: pass type arguments or --file'),
    );
  }
  return Promise.resolve(options.types.join('\n'));
}

function readFileOrStdin(path: string): Promise<string> {
  if (path === '-') {
    return readStdin();
  }
  return Promise.resolve(readFileSync(path, 'utf8'));
}

/** Drain STDIN to a string (used when `--file -`). */
function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: string[] = [];
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk: string) => {
      chunks.push(chunk);
    });
    process.stdin.on('end', () => {
      resolve(chunks.join(''));
    });
    process.stdin.on('error', reject);
  });
}
