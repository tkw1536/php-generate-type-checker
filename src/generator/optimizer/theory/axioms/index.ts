/** Registry of all Horn implication axioms. */
import type { TheoryRule } from '../types.ts';
import { ARRAY_RULES } from './array.ts';
import { CLASS_OBJECT_RULES } from './classObject.ts';
import { EQUALITY_TYPE_RULES } from './equalityType.ts';
import { EXCLUSIVE_RULES } from './exclusive.ts';

export const THEORY_RULES: readonly TheoryRule[] = [
  ...CLASS_OBJECT_RULES,
  ...EXCLUSIVE_RULES,
  ...EQUALITY_TYPE_RULES,
  ...ARRAY_RULES,
];
