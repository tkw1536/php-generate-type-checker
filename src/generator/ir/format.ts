import type { CheckerIR } from './types.ts';

/** Stable JSON dump for tests and debugging (not PHP). */
export function formatCheckerIR(ir: CheckerIR): string {
  return JSON.stringify({ order: ir.order, programs: ir.programs }, null, 2);
}
