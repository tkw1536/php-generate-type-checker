/**
 * Under list+count or list+non-empty, fold key_exists checks to TRUE.
 */
import { P } from '../pattern.builders.ts';
import type { RewriteRule } from '../types.ts';

export const LIST_COUNT_KEY_REWRITES: readonly RewriteRule[] = [
  {
    id: 'facts.normalize.listCountKeyExists',
    match: P.call('array_key_exists', [P.intLitVar('k'), P.argVar('x')]),
    replace: P.bool(true),
    require: [
      P.call('array_is_list', [P.argVar('x')]),
      P.bin('===', P.callArg('count', [P.argVar('x')]), P.intLitVar('n'), true),
    ],
    guard: (subst) => {
      const k = subst.ints.get('k');
      const n = subst.ints.get('n');
      return k !== undefined && n !== undefined && k < n;
    },
  },
  {
    id: 'facts.normalize.listNonEmptyKey0',
    match: P.call('array_key_exists', [P.lit('0'), P.argVar('x')]),
    replace: P.bool(true),
    require: [
      P.call('array_is_list', [P.argVar('x')]),
      P.bin('!==', P.argVar('x'), P.lit('[]'), true),
    ],
  },
  // Env stores expanded `!==` as `!(===)`.
  {
    id: 'facts.normalize.listNonEmptyKey0',
    match: P.call('array_key_exists', [P.lit('0'), P.argVar('x')]),
    replace: P.bool(true),
    require: [
      P.call('array_is_list', [P.argVar('x')]),
      P.not(P.bin('===', P.argVar('x'), P.lit('[]'), true)),
    ],
  },
];
