import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { CliUsageError } from './args.ts';
import { readCliInput } from './input.ts';

describe('readCliInput', () => {
  it('joins type arguments with newlines', async () => {
    await expect(
      readCliInput({ file: undefined, types: ['int', 'string'] }),
    ).resolves.toBe('int\nstring');
  });

  it('reads a file path', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gtc-cli-'));
    const filePath = path.join(dir, 'types.txt');
    fs.writeFileSync(filePath, 'positive-int\n');
    await expect(
      readCliInput({ file: filePath, types: [] }),
    ).resolves.toBe('positive-int\n');
  });

  it('rejects missing input as a usage error', async () => {
    await expect(readCliInput({ file: undefined, types: [] })).rejects.toThrow(
      CliUsageError,
    );
  });
});
