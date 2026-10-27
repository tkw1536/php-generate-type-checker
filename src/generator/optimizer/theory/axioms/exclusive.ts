/**
 * Primary PHP type tags are pairwise exclusive on one subject.
 * One rule per exclusive call (and null) so skipCallName is static data.
 */
import { EXCLUSIVE_IS_CALLS } from '../../lib/exclusiveTypes.ts';
import { P } from '../pattern.builders.ts';
import type { TheoryRule } from '../types.ts';

const fromCalls: TheoryRule[] = EXCLUSIVE_IS_CALLS.map((name) => ({
  id: 'exclusive' as const,
  premises: [P.call(name, [P.argVar('x')])],
  conclusions: [
    {
      kind: 'exclusiveNegations' as const,
      subject: 'x',
      skipCallName: name,
    },
  ],
}));

const fromNull: TheoryRule = {
  id: 'exclusive',
  premises: [P.bin('===', P.argVar('x'), P.lit('null'), true)],
  conclusions: [
    {
      kind: 'exclusiveNegations',
      subject: 'x',
      skipNull: true,
    },
  ],
};

const fromNullUpper: TheoryRule = {
  id: 'exclusive',
  premises: [P.bin('===', P.argVar('x'), P.lit('NULL'), true)],
  conclusions: [
    {
      kind: 'exclusiveNegations',
      subject: 'x',
      skipNull: true,
    },
  ],
};

export const EXCLUSIVE_RULES: readonly TheoryRule[] = [
  ...fromCalls,
  fromNull,
  fromNullUpper,
];
