import type { TypeNode } from '../parser/ast.ts';
import {
  type PhpLine,
  formatBody,
  ifBlock,
  line,
  shiftLines,
} from './context.ts';
import { normalizeNode, type ArrayNode } from './normalize.ts';
import {
  emitExpression as emitLeafExpression,
  isExpressible,
  isNoOpValueCheck,
  requireExpression,
} from './simpleTypes.ts';

export function needsStatementBlock(node: TypeNode): boolean {
  const n = normalizeNode(node);
  switch (n.kind) {
    case 'array':
    case 'list':
    case 'shape':
      return true;
    case 'union':
      return n.types.some(needsStatementBlock);
    case 'intersection':
      return n.types.some(needsStatementBlock);
    default:
      return false;
  }
}

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

export function emitStatementBlock(node: TypeNode, varName: string): PhpLine[] {
  const n = normalizeNode(node);
  return emitValidationLines(n, varName, { includeArrayGuard: true }, 0);
}

export function emitFunctionBody(node: TypeNode, varName: string): PhpLine[] {
  const n = normalizeNode(node);

  if (n.kind === 'union') {
    if (unionEveryMemberExpressibleWithoutBlock(n)) {
      return [line(0, `return ${emitExpression(n, varName)};`)];
    }
    return emitUnionFunctionBody(n, varName, 0);
  }

  if (n.kind === 'intersection') {
    const block: PhpLine[] = [];
    for (const member of n.types) {
      block.push(...emitValidationLines(member, varName, { includeArrayGuard: true }, 0));
    }
    block.push(line(0, 'return true;'));
    return block;
  }

  if (isNoOpValueCheck(n)) {
    return [line(0, 'return true;')];
  }

  if (isExpressible(n) && !needsStatementBlock(n)) {
    return [line(0, `return ${emitExpression(n, varName)};`)];
  }

  if (n.kind === 'array' && isUnconstrainedArray(n)) {
    return [line(0, `return ${arrayLikePositiveCheck(n, varName)};`)];
  }

  const block = emitValidationLines(n, varName, { includeArrayGuard: true }, 0);
  block.push(line(0, 'return true;'));
  return block;
}

export function emitBody(node: TypeNode, varName: string): string {
  return formatBody(emitFunctionBody(node, varName));
}

function emitUnionFunctionBody(
  node: Extract<TypeNode, { kind: 'union' }>,
  varName: string,
  depth: number,
): PhpLine[] {
  const members = sortUnionMembers(flattenUnion(node));
  const block: PhpLine[] = [];

  for (const member of members) {
    if (member.kind === 'primitive' && member.name === 'null') {
      block.push(...ifBlock(depth, `${varName} === null`, [line(0, 'return true;')]));
      continue;
    }

    if (isExpressible(member) && !needsStatementBlock(member)) {
      block.push(
        ...ifBlock(depth, emitExpression(member, varName), [line(0, 'return true;')]),
      );
      continue;
    }

    const guard = compoundGuard(member, varName);
    const body = emitValidationLines(member, varName, { includeArrayGuard: false }, 0);
    body.push(line(0, 'return true;'));
    block.push(...ifBlock(depth, guard, body));
  }

  block.push(line(depth, 'return false;'));
  return block;
}

function emitValidationLines(
  node: TypeNode,
  varName: string,
  options: { includeArrayGuard: boolean },
  depth: number,
): PhpLine[] {
  const n = normalizeNode(node);

  switch (n.kind) {
    case 'array':
      return emitArrayValidation(n, varName, options.includeArrayGuard, depth);
    case 'list':
      return emitListValidation(n, varName, options.includeArrayGuard, depth);
    case 'shape':
      return emitShapeValidation(n, varName, options.includeArrayGuard, depth);
    case 'union':
      if (options.includeArrayGuard) {
        return emitUnionFunctionBody(n, varName, depth);
      }
      return emitUnionExpressionValidation(n, varName, depth);
    case 'intersection':
      return n.types.flatMap((member) =>
        emitValidationLines(member, varName, options, depth),
      );
    default:
      if (isNoOpValueCheck(n)) {
        return [];
      }
      if (isExpressible(n)) {
        return ifBlock(depth, `!(${emitExpression(n, varName)})`, [line(0, 'return false;')]);
      }
      return emitValidationLines(n, varName, { ...options, includeArrayGuard: true }, depth);
  }
}

function emitUnionExpressionValidation(
  node: Extract<TypeNode, { kind: 'union' }>,
  varName: string,
  depth: number,
): PhpLine[] {
  return ifBlock(depth, `!(${emitExpression(node, varName)})`, [line(0, 'return false;')]);
}

function emitArrayValidation(
  node: ArrayNode,
  varName: string,
  includeGuard: boolean,
  depth: number,
): PhpLine[] {
  const block: PhpLine[] = [];
  if (includeGuard) {
    if (node.nonEmpty) {
      block.push(
        ...ifBlock(
          depth,
          `${arrayLikeNegatedGuard(node, varName)} || ${varName} === []`,
          [line(0, 'return false;')],
        ),
      );
    } else {
      block.push(
        ...ifBlock(depth, arrayLikeNegatedGuard(node, varName), [line(0, 'return false;')]),
      );
    }
  } else if (node.nonEmpty) {
    block.push(...ifBlock(depth, `${varName} === []`, [line(0, 'return false;')]));
  }
  const loopBody = emitArrayLoopBody(node);
  if (loopBody.length > 0) {
    const bindKey = arrayLoopBindsKey(node);
    block.push(
      line(
        depth,
        bindKey
          ? `foreach (${varName} as $key => $value) {`
          : `foreach (${varName} as $value) {`,
      ),
    );
    block.push(...shiftLines(1, loopBody));
    block.push(line(depth, '}'));
  }
  return block;
}

/** True when iteration must expose `$key` (key type is not a no-op check). */
function arrayLoopBindsKey(node: ArrayNode): boolean {
  return Boolean(node.key && !isNoOpValueCheck(node.key));
}

function emitArrayLoopBody(node: ArrayNode): PhpLine[] {
  const keyNeedsCheck = arrayLoopBindsKey(node);
  const valueNeedsCheck = !isNoOpValueCheck(node.value);
  const keyMergeable =
    Boolean(node.key) && isExpressible(node.key!) && !needsStatementBlock(node.key!);
  const valueMergeable =
    isExpressible(node.value) && !needsStatementBlock(node.value);

  if (keyNeedsCheck && keyMergeable && valueNeedsCheck && valueMergeable) {
    return ifBlock(
      0,
      `!(${emitExpression(node.key!, '$key')}) || !(${emitExpression(node.value, '$value')})`,
      [line(0, 'return false;')],
    );
  }

  const block: PhpLine[] = [];
  if (node.key && !isNoOpValueCheck(node.key)) {
    block.push(
      ...ifBlock(0, `!(${emitExpression(node.key, '$key')})`, [line(0, 'return false;')]),
    );
  }
  block.push(...emitValueValidation(node.value, '$value', 0));
  return block;
}

function emitListValidation(
  node: Extract<TypeNode, { kind: 'list' }>,
  varName: string,
  includeGuard: boolean,
  depth: number,
): PhpLine[] {
  const block: PhpLine[] = [];
  if (includeGuard) {
    block.push(
      ...ifBlock(depth, `!is_array(${varName}) || !array_is_list(${varName})`, [
        line(0, 'return false;'),
      ]),
    );
  }
  const loopBody = emitValueValidation(node.element, '$value', 0);
  if (loopBody.length > 0) {
    block.push(line(depth, `foreach (${varName} as $value) {`));
    block.push(...shiftLines(1, loopBody));
    block.push(line(depth, '}'));
  }
  return block;
}

function emitShapeValidation(
  node: Extract<TypeNode, { kind: 'shape' }>,
  varName: string,
  includeGuard: boolean,
  depth: number,
): PhpLine[] {
  const block: PhpLine[] = [];
  if (includeGuard) {
    block.push(...ifBlock(depth, `!is_array(${varName})`, [line(0, 'return false;')]));
  }
  for (const field of node.fields) {
    const keyExpr =
      typeof field.key === 'number' ? String(field.key) : phpString(String(field.key));
    if (!field.optional) {
      block.push(
        ...ifBlock(depth, `!array_key_exists(${keyExpr}, ${varName})`, [
          line(0, 'return false;'),
        ]),
      );
    }
    const fieldVar = `$field_${safeFieldVar(field.key)}`;
    const fieldBody: PhpLine[] = [
      line(0, `${fieldVar} = ${varName}[${keyExpr}];`),
      ...emitValueValidation(field.type, fieldVar, 0),
    ];
    if (field.optional) {
      block.push(
        ...ifBlock(depth, `array_key_exists(${keyExpr}, ${varName})`, fieldBody),
      );
    } else {
      block.push(...shiftLines(depth, fieldBody));
    }
  }
  return block;
}

function emitValueValidation(
  node: TypeNode,
  varName: string,
  depth: number,
): PhpLine[] {
  if (isNoOpValueCheck(node)) {
    return [];
  }
  if (isExpressible(node) && !needsStatementBlock(node)) {
    return ifBlock(depth, `!(${emitExpression(node, varName)})`, [line(0, 'return false;')]);
  }
  return emitValidationLines(node, varName, { includeArrayGuard: true }, depth);
}

function compoundGuard(node: TypeNode, varName: string): string {
  const n = normalizeNode(node);
  switch (n.kind) {
    case 'array':
      return arrayLikePositiveCheck(n as ArrayNode, varName);
    case 'list':
      return `is_array(${varName}) && array_is_list(${varName})`;
    case 'shape':
      return `is_array(${varName})`;
    case 'union': {
      const guards = flattenUnion(n).map((member) => {
        if (member.kind === 'primitive' && member.name === 'null') {
          return `${varName} === null`;
        }
        if (isExpressible(member) && !needsStatementBlock(member)) {
          return emitExpression(member, varName);
        }
        return compoundGuard(member, varName);
      });
      return `(${guards.join(' || ')})`;
    }
    default:
      return emitExpression(n, varName);
  }
}

function unionEveryMemberExpressibleWithoutBlock(
  node: Extract<TypeNode, { kind: 'union' }>,
): boolean {
  return flattenUnion(node).every(
    (m) => isExpressible(m) && !needsStatementBlock(m),
  );
}

function flattenUnion(node: TypeNode): TypeNode[] {
  if (node.kind === 'union') {
    return node.types.flatMap(flattenUnion);
  }
  return [node];
}

function sortUnionMembers(members: TypeNode[]): TypeNode[] {
  return [...members].sort((a, b) => unionSortKey(a) - unionSortKey(b));
}

function unionSortKey(node: TypeNode): number {
  if (node.kind === 'primitive' && node.name === 'null') {
    return 0;
  }
  if (isExpressible(node) && !needsStatementBlock(node)) {
    return 1;
  }
  return 2;
}

/** Key/value checks are no-ops (e.g. array<mixed>); only array / iterable top check applies. */
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

function arrayLikeNegatedGuard(node: ArrayNode, varName: string): string {
  return node.iterable ? `!is_iterable(${varName})` : `!is_array(${varName})`;
}

function safeFieldVar(key: string | number): string {
  return String(key).replace(/[^a-zA-Z0-9_]/g, '_');
}

function phpString(value: string): string {
  return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}
