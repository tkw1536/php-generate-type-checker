import type { RewriteRule } from '../types.ts';
import { COUNT_EMPTY_REWRITES } from './countEmpty.ts';
import { LIST_COUNT_KEY_REWRITES } from './listCountKey.ts';

export const REWRITE_RULES: readonly RewriteRule[] = [
  ...COUNT_EMPTY_REWRITES,
  ...LIST_COUNT_KEY_REWRITES,
];
