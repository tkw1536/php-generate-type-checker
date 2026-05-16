import type { CheckerIR } from '../ir/types.ts';
import type { GenerateCheckerOptions } from '../options.ts';
import {
  DEFAULT_CHECKER_OUTPUT,
  wrapChecker,
} from './output.ts';
import { renderProgramBody } from './php.ts';

const CHECKER_VALUE_PARAM = '$value';

export type RenderOptions = GenerateCheckerOptions & {
  entryDocType: string;
  docsByName: Record<string, string>;
};

export function render(ir: CheckerIR, options: RenderOptions): string {
  return new Renderer().render(ir, options);
}

class Renderer {
  render(ir: CheckerIR, options: RenderOptions): string {
    const mode = options.output ?? DEFAULT_CHECKER_OUTPUT;
    const useSelfCalls = mode !== 'function';
    const mainName =
      options.mainFunctionName ?? ir.order[0] ?? 'check';

    const helpers: string[] = [];
    for (let i = 1; i < ir.order.length; i++) {
      const name = ir.order[i]!;
      const program = ir.programs[name];
      const docType = options.docsByName[name];
      if (!program || !docType) {
        continue;
      }
      const body = renderProgramBody(program, { useSelfCalls });
      const doc = `/** @phpstan-assert-if-true ${docType} ${CHECKER_VALUE_PARAM} */`;
      helpers.push(
        `${doc}\nfunction ${name}(mixed ${CHECKER_VALUE_PARAM}): bool\n{\n${body}\n}`,
      );
    }

    const entryName = ir.order[0]!;
    const entryProgram = ir.programs[entryName]!;
    const entryBody = renderProgramBody(entryProgram, { useSelfCalls });

    return wrapChecker(
      options.entryDocType,
      entryBody,
      { ...options, output: mode, mainFunctionName: mainName },
      helpers.length > 0 ? helpers.join('\n\n') : undefined,
    );
  }
}
