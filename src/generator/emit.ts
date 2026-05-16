/**
 * Emits PHP runtime validation for PHPStan-aligned type ASTs.
 *
 * Structural bodies use the checker IR pipeline: build → optimize → emit.
 * Compact leaf types and top-level expressible unions stay as single `return` expressions.
 */
import type { TypeNode } from '../parser/ast.ts';
import { type PhpLine, formatBody, line } from './context.ts';
import {
  buildCheckerPipeline,
  emitCheckerProgramLines,
  type CheckerPipeline,
} from './checkerPipeline.ts';
import type { CheckerProgram } from './checkerIR.ts';
import { emitCheckerIR, type EmitCheckerIRInput } from './emitCheckerIR.ts';
import { normalizeNode, type ArrayNode } from './normalize.ts';
import {
  emitExpression as emitLeafExpression,
  isExpressible,
  isNeverPrimitive,
  isNoOpValueCheck,
  needsStatementBlock,
  requireExpression,
} from './simpleTypes.ts';
import { formatTypeForPhpstanDoc } from './typeDoc.ts';
import {
  DEFAULT_CHECKER_OUTPUT,
  type GenerateCheckerOptions,
} from './php.ts';
import {
  toIsFunctionIdentifier,
  typeToPascalSlug,
} from './checkerFunctionNames.ts';
import { flattenUnion, sortUnionMembers } from './unionOrder.ts';
import { typeDedupeKey } from './typeKey.ts';

/** Parameter name for checker function bodies (same as the main entry `mixed $value`). */
const HELPER_VALUE_PARAM = '$value';

/** Helpers string (after `check`) plus inner body lines for `check`. */
export interface EmittedCheckerBody {
  helpers: string;
  body: string;
}

export { negateExpressionForIf } from './negateExpression.ts';
export { needsStatementBlock } from './simpleTypes.ts';

export function emitExpression(node: TypeNode, varName: string): string {
  const n = normalizeNode(node);

  if (isNoOpValueCheck(n)) {
    return 'true';
  }

  if (n.kind === 'union') {
    const parts = flattenUnion(n).map((member) => emitExpression(member, varName));
    return `(${parts.join(' || ')})`;
  }

  if (n.kind === 'intersection') {
    const parts = n.types.map((member) => emitExpression(member, varName));
    return `(${parts.join(' && ')})`;
  }

  const leaf = emitLeafExpression(n, varName);
  if (leaf !== null) {
    return leaf;
  }

  return requireExpression(n, varName);
}

export function emitStatementBlock(
  node: TypeNode,
  varName: string,
  options?: GenerateCheckerOptions,
): PhpLine[] {
  return emitCheckerProgramLines(
    normalizeNode(node),
    varName,
    {
      resolveCheckerFunction: () => {
        throw new Error('emitStatementBlock does not emit checker functions');
      },
      allocateLoopPair: () => ({ key: '$key1', value: '$value1' }),
    },
    {
      prioritizeReadabilityOverCompactness:
        options?.prioritizeReadabilityOverCompactness,
    },
  );
}

export function emitFunctionBody(node: TypeNode, varName: string): PhpLine[] {
  const pipeline = buildCheckerPipeline(node, {
    parameter: varName,
    nameFunctionsByType: false,
  });
  const entry = pipeline.built.order[0]!;
  return emitCheckerFunctionBody(
    pipeline.typesByName[entry]!,
    pipeline.optimized.programs[entry]!,
    pipeline,
    (fn) => fn,
    undefined,
    varName,
  );
}

function compactTypeCheckExpression(n: TypeNode, varName: string): string | null {
  const node = normalizeNode(n);

  if (isNoOpValueCheck(node)) {
    return 'true';
  }

  if (isExpressible(node) && !needsStatementBlock(node)) {
    return emitExpression(node, varName);
  }

  if (node.kind === 'array' && isUnconstrainedArray(node as ArrayNode)) {
    return arrayLikePositiveCheck(node as ArrayNode, varName);
  }

  if (node.kind === 'list' && isNoOpValueCheck(node.element)) {
    const listNode = node as Extract<TypeNode, { kind: 'list' }>;
    const listOk = `is_array(${varName}) && array_is_list(${varName})`;
    return listNode.nonEmpty ? `${listOk} && ${varName} !== []` : listOk;
  }

  if (node.kind === 'array') {
    const an = node as ArrayNode;
    if (
      !an.key &&
      !an.iterable &&
      an.nonEmpty &&
      isNoOpValueCheck(an.value)
    ) {
      return `is_array(${varName}) && ${varName} !== []`;
    }
    if (isNeverPrimitive(an.value) && !an.iterable) {
      if (an.nonEmpty) {
        return 'false';
      }
      return `${varName} === []`;
    }
  }
  if (node.kind === 'list' && isNeverPrimitive(node.element)) {
    if (node.nonEmpty) {
      return 'false';
    }
    return `${varName} === []`;
  }

  return null;
}

function tryEmitCompactReturnLines(n: TypeNode, varName: string): PhpLine[] | null {
  const expr = compactTypeCheckExpression(n, varName);
  if (expr !== null) {
    return [line(0, `return ${expr};`)];
  }
  return null;
}

function checkerNameForType(
  pipeline: CheckerPipeline,
  type: TypeNode,
): string {
  const key = typeDedupeKey(normalizeNode(type));
  const name = pipeline.namesByTypeKey[key];
  if (name === undefined) {
    throw new Error(`internal: no checker function for type key ${key}`);
  }
  return name;
}

function emitRootUnionDisjunctive(
  node: Extract<TypeNode, { kind: 'union' }>,
  varName: string,
  pipeline: CheckerPipeline,
  formatCall: (fnName: string) => string,
): PhpLine[] {
  const members = sortUnionMembers(flattenUnion(node));
  const parts: string[] = [];
  for (const m of members) {
    const nm = normalizeNode(m);
    const inline = compactTypeCheckExpression(nm, varName);
    if (inline !== null) {
      parts.push(inline);
    } else {
      parts.push(`${formatCall(checkerNameForType(pipeline, m))}(${varName})`);
    }
  }
  return [line(0, `return ${parts.join(' || ')};`)];
}

function emitCheckerFunctionBody(
  node: TypeNode,
  program: CheckerProgram,
  pipeline: CheckerPipeline,
  formatCall: (fnName: string) => string,
  emitInput: EmitCheckerIRInput | undefined,
  varName: string,
): PhpLine[] {
  const n = normalizeNode(node);

  if (n.kind === 'union') {
    if (unionEveryMemberExpressibleWithoutBlock(n)) {
      return [line(0, `return ${emitExpression(n, varName)};`)];
    }
    return emitRootUnionDisjunctive(n, varName, pipeline, formatCall);
  }

  const compact = tryEmitCompactReturnLines(n, varName);
  if (compact) {
    return compact;
  }

  return emitCheckerIR(program, emitInput);
}

export function emitFromPipeline(
  pipeline: CheckerPipeline,
  options?: GenerateCheckerOptions,
): EmittedCheckerBody {
  const outputMode = options?.output ?? DEFAULT_CHECKER_OUTPUT;
  const useSelfCalls = outputMode !== 'function';
  const formatCall = (fnName: string) =>
    useSelfCalls ? `self::${fnName}` : fnName;
  const emitInput: EmitCheckerIRInput = {
    prioritizeReadabilityOverCompactness:
      options?.prioritizeReadabilityOverCompactness,
  };

  const helperBlocks: string[] = [];
  let body = '';

  const emitOrder = pipeline.built.order;
  for (let i = 0; i < emitOrder.length; i++) {
    const name = emitOrder[i]!;
    const type = pipeline.typesByName[name]!;
    const program = pipeline.optimized.programs[name]!;
    const lines = emitCheckerFunctionBody(
      type,
      program,
      pipeline,
      formatCall,
      emitInput,
      HELPER_VALUE_PARAM,
    );
    const formatted = formatBody(lines);
    if (i === 0) {
      body = formatted;
    } else {
      const doc = `/** @phpstan-assert-if-true ${formatTypeForPhpstanDoc(type)} ${HELPER_VALUE_PARAM} */`;
      helperBlocks.push(
        `${doc}\nfunction ${name}(mixed ${HELPER_VALUE_PARAM}): bool\n{\n${formatted}\n}`,
      );
    }
  }

  return {
    helpers: helperBlocks.length === 0 ? '' : helperBlocks.join('\n\n'),
    body,
  };
}

export class CheckerCodegen {
  private readonly options: GenerateCheckerOptions | undefined;

  constructor(options?: GenerateCheckerOptions) {
    this.options = options;
  }

  emitBody(node: TypeNode, varName: string): EmittedCheckerBody {
    const options = this.options;
    const nameFunctionsByType = options?.nameFunctionsByType !== false;
    const mainFunctionName =
      options?.mainFunctionName ??
      (nameFunctionsByType
        ? toIsFunctionIdentifier(typeToPascalSlug(node))
        : 'check');
    const pipeline = buildCheckerPipeline(node, {
      parameter: varName,
      nameFunctionsByType,
      mainFunctionName,
      prioritizeReadabilityOverCompactness:
        options?.prioritizeReadabilityOverCompactness,
      output: options?.output,
    });
    return emitFromPipeline(pipeline, options);
  }
}

export function emitBody(
  node: TypeNode,
  varName: string,
  options?: GenerateCheckerOptions,
): EmittedCheckerBody {
  return new CheckerCodegen(options).emitBody(node, varName);
}

function unionEveryMemberExpressibleWithoutBlock(
  node: Extract<TypeNode, { kind: 'union' }>,
): boolean {
  return flattenUnion(node).every(
    (m) => isExpressible(m) && !needsStatementBlock(m),
  );
}

function isUnconstrainedArray(node: ArrayNode): boolean {
  if (node.nonEmpty) {
    return false;
  }
  if (node.key && !isNoOpValueCheck(node.key)) {
    return false;
  }
  if (!isNoOpValueCheck(node.value)) {
    return false;
  }
  return true;
}

function arrayLikePositiveCheck(node: ArrayNode, varName: string): string {
  return node.iterable ? `is_iterable(${varName})` : `is_array(${varName})`;
}
