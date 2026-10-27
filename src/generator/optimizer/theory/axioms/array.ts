/** Array emptiness, key_exists, list contiguous-key implications. */
import { P } from '../pattern.builders.ts';
import type { TheoryRule } from '../types.ts';

export const ARRAY_RULES: readonly TheoryRule[] = [
  {
    id: 'emptyArrayCount',
    premises: [P.bin('===', P.argVar('x'), P.lit('[]'), true)],
    conclusions: [
      {
        kind: 'pattern',
        pattern: P.bin('===', P.callArg('count', [P.argVar('x')]), P.lit('0')),
      },
    ],
  },
  {
    id: 'arrayKeyExistsNonEmpty',
    premises: [P.call('array_key_exists', [P.anyArg(), P.argVar('x')])],
    conclusions: [
      {
        kind: 'pattern',
        pattern: P.bin('!==', P.argVar('x'), P.lit('[]')),
      },
    ],
  },
  {
    id: 'arrayKeyExistsCountNonZero',
    premises: [P.call('array_key_exists', [P.anyArg(), P.argVar('x')])],
    conclusions: [
      {
        kind: 'pattern',
        pattern: P.bin(
          '!==',
          P.callArg('count', [P.argVar('x')]),
          P.lit('0'),
        ),
      },
    ],
  },
  {
    id: 'countPositiveNonEmpty',
    premises: [
      P.bin('===', P.callArg('count', [P.argVar('x')]), P.intLitVar('n'), true),
    ],
    guard: (subst) => {
      const n = subst.ints.get('n');
      return n !== undefined && n >= 1;
    },
    conclusions: [
      {
        kind: 'pattern',
        pattern: P.bin('!==', P.argVar('x'), P.lit('[]')),
      },
    ],
  },
  {
    id: 'notKey0NotListOrEmpty',
    premises: [
      P.not(P.call('array_key_exists', [P.lit('0'), P.argVar('x')])),
    ],
    conclusions: [
      {
        kind: 'pattern',
        pattern: P.or([
          P.not(P.call('array_is_list', [P.argVar('x')])),
          P.bin('===', P.argVar('x'), P.lit('[]')),
        ]),
      },
    ],
  },
  {
    id: 'listHigherKeyExists',
    premises: [
      P.call('array_is_list', [P.argVar('x')]),
      P.call('array_key_exists', [P.intLitVar('n'), P.argVar('x')]),
    ],
    guard: (subst) => {
      const n = subst.ints.get('n');
      return n !== undefined && n >= 1;
    },
    conclusions: [
      {
        kind: 'keysBelow',
        subject: 'x',
        n: 'n',
      },
    ],
  },
];
