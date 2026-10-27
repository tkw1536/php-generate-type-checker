/** Class / object shape implications. */
import { P } from '../pattern.builders.ts';
import type { TheoryRule } from '../types.ts';

export const CLASS_OBJECT_RULES: readonly TheoryRule[] = [
  {
    id: 'instanceofObject',
    premises: [P.instanceOf(P.argVar('x'))],
    conclusions: [{ kind: 'pattern', pattern: P.call('is_object', [P.argVar('x')]) }],
  },
  {
    id: 'isAClassExists',
    premises: [
      P.call('is_a', [P.argVar('x'), P.anyArg(), P.lit('TRUE')]),
    ],
    conclusions: [
      { kind: 'pattern', pattern: P.call('class_exists', [P.argVar('x')]) },
    ],
  },
  {
    id: 'isAClassExists',
    premises: [
      P.call('is_a', [P.argVar('x'), P.anyArg(), P.lit('true')]),
    ],
    conclusions: [
      { kind: 'pattern', pattern: P.call('class_exists', [P.argVar('x')]) },
    ],
  },
];
