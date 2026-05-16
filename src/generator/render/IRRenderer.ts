import type { TypeNode } from '../../parser/ast.ts';
import type { CheckerIR } from '../ir/types.ts';
import { formatTypeForPhpstanDoc } from './phpdoc.ts';
import {
  DEFAULT_CHECKER_OUTPUT,
  type GenerateCheckerOptions,
  wrapChecker,
} from '../php.ts';
import { renderProgramBody } from './renderPhp.ts';

const CHECKER_VALUE_PARAM = '$value';

export type RenderOptions = GenerateCheckerOptions & {
  typeString: string;
  typesByName: Record<string, TypeNode>;
};

export class IRRenderer {
  render(ir: CheckerIR, options: RenderOptions): string {
    const mode = options.output ?? DEFAULT_CHECKER_OUTPUT;
    const useSelfCalls = mode !== 'function';
    const mainName =
      options.mainFunctionName ?? ir.order[0] ?? 'check';

    const helpers: string[] = [];
    for (let i = 1; i < ir.order.length; i++) {
      const name = ir.order[i]!;
      const program = ir.programs[name];
      const type = options.typesByName[name];
      if (!program || !type) {
        continue;
      }
      const body = renderProgramBody(program, { useSelfCalls });
      const doc = `/** @phpstan-assert-if-true ${formatTypeForPhpstanDoc(type)} ${CHECKER_VALUE_PARAM} */`;
      helpers.push(
        `${doc}\nfunction ${name}(mixed ${CHECKER_VALUE_PARAM}): bool\n{\n${body}\n}`,
      );
    }

    const entryName = ir.order[0]!;
    const entryProgram = ir.programs[entryName]!;
    const entryType = options.typesByName[entryName];
    const entryBody = renderProgramBody(entryProgram, { useSelfCalls });
    const entryDocType = entryType
      ? formatTypeForPhpstanDoc(entryType)
      : options.typeString;

    return wrapChecker(
      entryDocType,
      entryBody,
      { ...options, output: mode, mainFunctionName: mainName },
      helpers.length > 0 ? helpers.join('\n\n') : undefined,
    );
  }
}

export function render(ir: CheckerIR, options: RenderOptions): string {
  return new IRRenderer().render(ir, options);
}
