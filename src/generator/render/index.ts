import type { CheckerIR } from '../ir/types.ts';
import type { GenerateCheckerOptions } from '../options.ts';
import {
  DEFAULT_CHECKER_OUTPUT,
  wrapChecker,
  wrapMultipleEntries,
  type EntryRenderSpec,
  type HelperRenderSpec,
} from './output.ts';
import { renderProgramBody } from './php.ts';

export type RenderOptions = GenerateCheckerOptions & {
  readonly entryDocType: string;
  readonly docsByName: Readonly<Record<string, string>>;
};

export function render(ir: CheckerIR, options: RenderOptions): string {
  return new Renderer().render(ir, options);
}

class Renderer {
  render(ir: CheckerIR, options: RenderOptions): string {
    const mode = options.output ?? DEFAULT_CHECKER_OUTPUT;
    const useSelfCalls = mode !== 'function';
    const entrySet = new Set(ir.entries);
    const entryNames =
      ir.entries.length > 0 ? ir.entries : ir.order[0] === undefined ? [] : [ir.order[0]];

    const helpers: HelperRenderSpec[] = [];
    for (const name of ir.order) {
      if (entrySet.has(name)) {
        continue;
      }
      const program = ir.programs[name];
      const docType = options.docsByName[name];
      if (!program || !docType) {
        continue;
      }
      const body = renderProgramBody(program, { useSelfCalls });
      helpers.push({ functionName: name, docType, body });
    }

    const entrySpecs: EntryRenderSpec[] = [];
    for (const name of entryNames) {
      const program = ir.programs[name];
      if (!program) {
        continue;
      }
      const docType =
        options.docsByName[name] ??
        (entryNames.length === 1 ? options.entryDocType : name);
      const body = renderProgramBody(program, { useSelfCalls });
      const functionName =
        entryNames.length === 1
          ? (options.mainFunctionName ?? name)
          : name;
      entrySpecs.push({ functionName, docType, body });
    }

    if (entrySpecs.length === 0) {
      return '';
    }
    if (entrySpecs.length === 1) {
      const entry = entrySpecs[0];
      return wrapChecker(
        entry.docType,
        entry.body,
        { ...options, output: mode, mainFunctionName: entry.functionName },
        helpers,
      );
    }
    return wrapMultipleEntries(entrySpecs, { ...options, output: mode }, helpers);
  }
}
