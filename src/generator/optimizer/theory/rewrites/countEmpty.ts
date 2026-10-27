/** Under known is_array, rewrite count===0 to ===[]. */
import { P } from '../pattern.builders.ts';
import type { RewriteRule } from '../types.ts';

export const COUNT_EMPTY_REWRITES: readonly RewriteRule[] = [
  {
    id: 'facts.normalize.countEmpty',
    match: P.bin('===', P.callArg('count', [P.argVar('x')]), P.lit('0'), true),
    replace: P.bin('===', P.argVar('x'), P.lit('[]')),
    require: [P.call('is_array', [P.argVar('x')])],
  },
  {
    id: 'facts.normalize.countEmpty',
    match: P.bin('!==', P.callArg('count', [P.argVar('x')]), P.lit('0'), true),
    replace: P.bin('!==', P.argVar('x'), P.lit('[]')),
    require: [P.call('is_array', [P.argVar('x')])],
  },
];
