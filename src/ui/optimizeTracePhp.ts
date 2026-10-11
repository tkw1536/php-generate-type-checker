import { renderTraceSnapshot } from '../generator/optimizer/trace/render.ts';
import type {
  OptimizeTraceEvent,
  TraceScopeSnapshot,
} from '../generator/optimizer/trace/types.ts';
import { assignTempNames } from '../generator/render/refs.ts';
import { type PhpDiffResult, phpDiff } from './phpDiff.ts';

/** Wrap a checker body (already indented by formatBody) as a top-level function. */
function wrapAsFunction(name: string, bodyPhp: string): string {
  return `function ${name}(mixed $value): bool\n{\n${bodyPhp}\n}`;
}

/**
 * Render a checker/IR snapshot for Before/After/Diff — always full checker PHP
 * with a function header (display only; functional syntax regardless of output mode).
 */
function renderCheckerViewPhp(
  snap: TraceScopeSnapshot,
  program: string,
): string {
  if (snap.kind === 'ir') {
    const parts: string[] = [];
    for (const name of snap.ir.order) {
      const prog = snap.ir.programs[name];
      if (prog === undefined) {
        continue;
      }
      const body = renderTraceSnapshot({
        kind: 'block',
        block: prog.body,
        tempNames: assignTempNames(prog),
      });
      parts.push(wrapAsFunction(name, body));
    }
    return parts.join('\n\n');
  }
  if (program === '(prune)') {
    return renderTraceSnapshot(snap);
  }
  return wrapAsFunction(program, renderTraceSnapshot(snap));
}

/**
 * Before / After / Diff all use the full checker PHP (with function header).
 */
export function checkerPhpForEvent(event: OptimizeTraceEvent): {
  readonly beforePhp: string;
  readonly afterPhp: string;
  readonly diff: PhpDiffResult;
} {
  const beforePhp = renderCheckerViewPhp(
    event.checker.before,
    event.program,
  );
  const afterPhp = renderCheckerViewPhp(event.checker.after, event.program);
  return {
    beforePhp,
    afterPhp,
    diff: phpDiff(beforePhp, afterPhp),
  };
}
