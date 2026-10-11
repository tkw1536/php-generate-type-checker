import { formatBody } from '../../render/context.ts';
import { renderBlock, renderProgramBody } from '../../render/php.ts';
import { renderExpr } from '../../render/phpExpr.ts';
import type { OptimizeTraceSnapshot, TraceScopeSnapshot } from './types.ts';

/** Render a trace snapshot as PHP for the Optimize Trace UI. */
export function renderTraceSnapshot(
  snap: OptimizeTraceSnapshot | TraceScopeSnapshot,
): string {
  switch (snap.kind) {
    case 'expr':
      return renderExpr(snap.expr);
    case 'block':
      return formatBody(
        renderBlock(snap.block, 0, {
          tempNames: snap.tempNames ?? undefined,
        }),
      );
    case 'ir': {
      const parts: string[] = [];
      for (const name of snap.ir.order) {
        const program = snap.ir.programs[name];
        if (program === undefined) {
          continue;
        }
        parts.push(`// ${name}`, renderProgramBody(program));
      }
      return parts.join('\n');
    }
    default:
      throw new Error('never reached');
  }
}
