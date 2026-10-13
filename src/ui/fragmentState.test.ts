import { describe, expect, it } from 'vitest';
import {
  decodeFragmentState,
  encodeFragmentState,
  type AppFragmentState,
} from './fragmentState.ts';

const sample: AppFragmentState = {
  optimize: false,
  verbosePhpdoc: true,
  unsafeStringArrayKeys: true,
  sealArrayShapes: true,
  emit: 'public_static',
  emitAliases: true,
  resolveAliases: false,
  input: 'array{x: list<string>}',
};

describe('fragmentState', () => {
  it('round-trips via URLSearchParams encoding', () => {
    const encoded = encodeFragmentState(sample);
    expect(encoded).toContain('optimize=0');
    expect(encoded).toContain('verbose=1');
    expect(encoded).toContain('unsafekeys=1');
    expect(encoded).toContain('seal=1');
    expect(encoded).not.toContain('unseal=');
    expect(encoded).toContain('emit=public_static');
    expect(encoded).toContain('aliases=1');
    expect(encoded).toContain('resolve=0');
    expect(encoded).toContain('input=array%7Bx%3A+list%3Cstring%3E%7D');
    expect(encoded).not.toContain('name=');

    expect(decodeFragmentState(`#${encoded}`)).toEqual(sample);
  });

  it('maps legacy unseal fragment param to sealArrayShapes', () => {
    expect(decodeFragmentState('#unseal=1&input=int')).toEqual({
      sealArrayShapes: false,
      input: 'int',
    });
    expect(decodeFragmentState('#unseal=0&input=int')).toEqual({
      sealArrayShapes: true,
      input: 'int',
    });
  });

  it('prefers seal over legacy unseal when both are present', () => {
    expect(decodeFragmentState('#seal=1&unseal=1&input=int')).toEqual({
      sealArrayShapes: true,
      input: 'int',
    });
  });

  it('escapes special characters in input', () => {
    const state: AppFragmentState = {
      ...sample,
      input: 'a&b=c\n"d',
    };
    const encoded = encodeFragmentState(state);
    expect(decodeFragmentState(encoded)).toEqual(state);
  });

  it('returns null for empty hash', () => {
    expect(decodeFragmentState('')).toBeNull();
    expect(decodeFragmentState('#')).toBeNull();
  });

  it('ignores invalid emit values', () => {
    expect(decodeFragmentState('#emit=not-a-mode&input=int')).toEqual({
      input: 'int',
    });
  });

  it('ignores legacy name fragment param', () => {
    expect(decodeFragmentState('#input=int&name=0')).toEqual({
      input: 'int',
    });
  });

  it('keeps short PHPDoc when verbose is absent from the hash', () => {
    expect(decodeFragmentState('#input=int&optimize=1')).toEqual({
      optimize: true,
      input: 'int',
    });
  });
});
