import { describe, expect, it } from 'vitest';
import { phpDiff } from './phpDiff.ts';

describe('phpDiff', () => {
  it('returns empty hunks when texts are identical', () => {
    const result = phpDiff('return true;\n', 'return true;\n');
    expect(result.hunks).toEqual([]);
    expect(result.unified).toBe('');
  });

  it('emits a unified hunk with three lines of context', () => {
    const before = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].join('\n');
    const after = ['a', 'b', 'c', 'X', 'e', 'f', 'g', 'h'].join('\n');
    const result = phpDiff(before, after);
    expect(result.hunks).toHaveLength(1);
    const hunk = result.hunks[0];
    expect(hunk.lines.map((l) => `${l.kind}:${l.text}`)).toEqual([
      'ctx:a',
      'ctx:b',
      'ctx:c',
      'del:d',
      'add:X',
      'ctx:e',
      'ctx:f',
      'ctx:g',
    ]);
    expect(result.unified).toContain('--- before');
    expect(result.unified).toContain('+++ after');
    expect(result.unified).toContain('-d');
    expect(result.unified).toContain('+X');
  });

  it('merges nearby changes into one hunk', () => {
    const before = ['1', '2', '3', '4', '5'].join('\n');
    const after = ['1', 'A', '3', 'B', '5'].join('\n');
    const result = phpDiff(before, after);
    expect(result.hunks).toHaveLength(1);
    const tags = result.hunks[0].lines.map((l) => `${l.kind}:${l.text}`);
    expect(tags).toContain('del:2');
    expect(tags).toContain('add:B');
  });
});
