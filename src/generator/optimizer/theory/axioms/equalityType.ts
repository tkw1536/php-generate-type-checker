/**
 * Typed literal equality implies the matching exclusive is_* tag
 * (null uses the exclusive-null path instead).
 */
import { exclusiveCallNameForLiteral } from '../../lib/exclusiveTypes.ts';
import { P } from '../pattern.builders.ts';
import type { TheoryRule } from '../types.ts';

export const EQUALITY_TYPE_RULES: readonly TheoryRule[] = [
  {
    id: 'equalityType',
    premises: [P.bin('===', P.argVar('x'), P.litVar('lit'), true)],
    guard: (subst) => {
      const lit = subst.literals.get('lit');
      return lit !== undefined && exclusiveCallNameForLiteral(lit) !== null;
    },
    conclusions: [
      {
        kind: 'equalityTypeCall',
        subject: 'x',
        lit: 'lit',
      },
    ],
  },
];
