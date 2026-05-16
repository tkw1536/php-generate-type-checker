/**
 * Emits PHP runtime validation for PHPStan-aligned type ASTs.
 *
 * **Union semantics (structural):** A value satisfies `T1 | T2` iff it fully satisfies `T1` or fully
 * satisfies `T2`. Top-level unions become a boolean **OR** of member predicates (or `check_N()`).
 * Unions validated **inside** a `foreach` (element type) use **per-element** disjunction:
 * each item must match at least one member — never “first matching arm wins the whole checker.”
 *
 * Helpers are deduped by {@link typeDedupeKey} (surface name `is{Type}` or legacy `check_N`);
 * emit at most one helper per distinct type.
 * Union members that reduce to a compact predicate (e.g. `array<never>` → `$var === []`) are inlined
 * in `return … || …` instead of calling a helper.
 */
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
  isNeverPrimitive,
  isNoOpValueCheck,
  needsStatementBlock,
  requireExpression,
} from './simpleTypes.ts';
import { typeDedupeKey } from './typeKey.ts';
import { formatTypeForPhpstanDoc } from './typeDoc.ts';
import { DEFAULT_CHECKER_OUTPUT, type CheckerOutputMode, type GenerateCheckerOptions } from './php.ts';
import {
  IsFunctionNameRegistry,
  toIsFunctionIdentifier,
  typeToPascalSlug,
} from './helperFunctionNames.ts';
import { flattenUnion, sortUnionMembers } from './unionOrder.ts';

/** Parameter name for helper bodies (same as the main entry `mixed $value`). */
const HELPER_VALUE_PARAM = '$value';

/** Helpers string (after `check`) plus inner body lines for `check`. */
export interface EmittedCheckerBody {
  /** One-line PHPDoc + helper `function` per helper, or empty. */
  helpers: string;
  /** Formatted body inside `check` only. */
  body: string;
}

/** Options for {@link emitValidationLines} and nested value/array emitters. */
export type ValidationEmitOptions = {
  includeArrayGuard: boolean;
  /**
   * After a prior intersection member (or equivalent), `$varName` is known to satisfy `is_array`
   * so a redundant `!is_array` / shape top guard can be omitted.
   */
  assumeVarIsArray?: boolean;
  /**
   * After a prior intersection member, `$varName` is known to satisfy `is_object` so a redundant
   * `!is_object` guard on an object shape can be omitted.
   */
  assumeVarIsObject?: boolean;
  /**
   * When set, {@link emitShapeValidation} sets `value` to true if the shape body ends with a
   * terminal `return <predicate>;` (required last field, expressible type) so the caller can omit
   * a trailing `return true;`.
   */
  shapeTailReturnEmitted?: { value: boolean };
};

/** Strip matching outer parentheses, e.g. `(is_string($x))` → `is_string($x)`. */
function stripRedundantOuterParens(expr: string): string {
  let e = expr.trim();
  while (e.length >= 2 && e[0] === '(') {
    let depth = 0;
    let matchedAtEnd = false;
    for (let i = 0; i < e.length; i++) {
      const ch = e[i];
      if (ch === '(') depth++;
      else if (ch === ')') {
        depth--;
        if (depth === 0) {
          matchedAtEnd = i === e.length - 1;
          break;
        }
      }
    }
    if (matchedAtEnd) {
      e = e.slice(1, -1).trim();
    } else {
      break;
    }
  }
  return e;
}

function hasTopLevelLogicalOp(expr: string): boolean {
  let depth = 0;
  for (let i = 0; i < expr.length; i++) {
    const ch = expr[i];
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    else if (
      depth === 0 &&
      (expr.startsWith(' || ', i) || expr.startsWith(' && ', i))
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Negated `if` condition: use `!foo()` instead of `!(foo())` when the operand is a single
 * predicate; keep `!(a || b)` / `!(a && b)` when grouping matters for `!` vs `&&`/`||` precedence.
 */
function negateExpressionForIf(inner: string): string {
  const e = stripRedundantOuterParens(inner);
  if (hasTopLevelLogicalOp(e)) {
    return `!(${e})`;
  }
  /* PHP: `!` binds tighter than `instanceof` — wrap so negation applies to the whole check. */
  if (e.includes(' instanceof ')) {
    return `!(${e})`;
  }
  return `!${e}`;
}

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

export function emitStatementBlock(node: TypeNode, varName: string): PhpLine[] {
  const n = normalizeNode(node);
  return emitValidationLines(
    n,
    varName,
    { includeArrayGuard: true },
    0,
    new EmitContext(),
  );
}

/** Returns the main checker body lines only; helpers are discarded (use {@link emitBody}). */
export function emitFunctionBody(node: TypeNode, varName: string): PhpLine[] {
  return emitFunctionBodyWithContext(node, varName, new EmitContext());
}

/**
 * Boolean PHP expression for “value satisfies T” when T matches the same compact paths as a
 * one-line `return …` body (including `array<never>` → `$var === []`). Used for unions to **inline**
 * those members instead of emitting an extra helper call.
 */
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

/**
 * Single `return …;` bodies used by both the entry function and helpers (non-structural
 * types); keeps e.g. `array<never>` as `return $v === []` instead of an if/return pair.
 */
function tryEmitCompactReturnLines(n: TypeNode, varName: string): PhpLine[] | null {
  const expr = compactTypeCheckExpression(n, varName);
  if (expr !== null) {
    return [line(0, `return ${expr};`)];
  }
  return null;
}

function emitFunctionBodyWithContext(
  node: TypeNode,
  varName: string,
  ctx: EmitContext,
): PhpLine[] {
  const n = normalizeNode(node);

  if (n.kind === 'union') {
    if (unionEveryMemberExpressibleWithoutBlock(n)) {
      return [line(0, `return ${emitExpression(n, varName)};`)];
    }
    return emitRootUnionDisjunctive(n, varName, ctx);
  }

  if (n.kind === 'intersection') {
    const block = emitIntersectionMembers(n, varName, 0, ctx, {
      includeArrayGuard: true,
    });
    block.push(line(0, 'return true;'));
    return block;
  }

  const compact = tryEmitCompactReturnLines(n, varName);
  if (compact) {
    return compact;
  }

  const tailMeta = { value: false };
  const block = emitValidationLines(n, varName, {
    includeArrayGuard: true,
    shapeTailReturnEmitted: tailMeta,
  }, 0, ctx);
  if (!tailMeta.value) {
    block.push(line(0, 'return true;'));
  }
  return block;
}

export function emitBody(
  node: TypeNode,
  varName: string,
  options?: GenerateCheckerOptions,
): EmittedCheckerBody {
  const outputMode = options?.output ?? DEFAULT_CHECKER_OUTPUT;
  const nameFunctionsByType = options?.nameFunctionsByType !== false;
  const mainFunctionName =
    options?.mainFunctionName ??
    (nameFunctionsByType
      ? toIsFunctionIdentifier(typeToPascalSlug(node))
      : 'check');
  const registry = nameFunctionsByType
    ? new IsFunctionNameRegistry([mainFunctionName])
    : null;
  const ctx = new EmitContext(outputMode, nameFunctionsByType, registry);
  const mainLines = emitFunctionBodyWithContext(node, varName, ctx);
  const body = formatBody(mainLines);
  const helpers =
    ctx.helperFns.length === 0
      ? ''
      : ctx.helperFns
          .map((h) => {
            const doc = `/** @phpstan-assert-if-true ${h.docType} ${HELPER_VALUE_PARAM} */`;
            return `${doc}\nfunction ${h.functionName}(mixed ${HELPER_VALUE_PARAM}): bool\n{\n${formatBody(h.lines)}\n}`;
          })
          .join('\n\n');
  return { helpers, body };
}

/** Top-level union: `return p1 || p2 || helper($var);` (disjunctive; overlapping guards OK). */
function emitRootUnionDisjunctive(
  node: Extract<TypeNode, { kind: 'union' }>,
  varName: string,
  ctx: EmitContext,
): PhpLine[] {
  const members = sortUnionMembers(flattenUnion(node));
  const parts: string[] = [];
  for (const m of members) {
    const nm = normalizeNode(m);
    const inline = compactTypeCheckExpression(nm, varName);
    if (inline !== null) {
      parts.push(inline);
    } else {
      parts.push(`${ctx.ensureHelper(m)}(${varName})`);
    }
  }
  return [line(0, `return ${parts.join(' || ')};`)];
}

/**
 * Union inside foreach / negation: reject unless the value matches **some** member
 * (full structural checks via helpers when needed).
 */
function emitNestedUnionValidation(
  node: Extract<TypeNode, { kind: 'union' }>,
  varName: string,
  depth: number,
  ctx: EmitContext,
): PhpLine[] {
  if (unionEveryMemberExpressibleWithoutBlock(node)) {
    return emitUnionExpressionValidation(node, varName, depth);
  }
  const members = sortUnionMembers(flattenUnion(node));
  const parts: string[] = [];
  for (const m of members) {
    const nm = normalizeNode(m);
    const inline = compactTypeCheckExpression(nm, varName);
    if (inline !== null) {
      parts.push(inline);
    } else {
      parts.push(`${ctx.ensureHelper(m)}(${varName})`);
    }
  }
  return ifBlock(depth, negateExpressionForIf(parts.join(' || ')), [line(0, 'return false;')]);
}

function emitUnionExpressionValidation(
  node: Extract<TypeNode, { kind: 'union' }>,
  varName: string,
  depth: number,
): PhpLine[] {
  return ifBlock(depth, negateExpressionForIf(emitExpression(node, varName)), [
    line(0, 'return false;'),
  ]);
}

function buildHelperLines(n: TypeNode, ctx: EmitContext): PhpLine[] {
  const node = normalizeNode(n);
  const v = HELPER_VALUE_PARAM;
  if (node.kind === 'union') {
    if (unionEveryMemberExpressibleWithoutBlock(node)) {
      return [line(0, `return ${emitExpression(node, v)};`)];
    }
    return emitRootUnionDisjunctive(node, v, ctx);
  }
  return emitMatcherTail(node, v, ctx);
}

/** Body for a helper validating a single non-union (or already-split) type. */
function emitMatcherTail(node: TypeNode, varName: string, ctx: EmitContext): PhpLine[] {
  const n = normalizeNode(node);
  const compact = tryEmitCompactReturnLines(n, varName);
  if (compact) {
    return compact;
  }
  const tailMeta = { value: false };
  const block = emitValidationLines(n, varName, {
    includeArrayGuard: true,
    shapeTailReturnEmitted: tailMeta,
  }, 0, ctx);
  if (!tailMeta.value) {
    block.push(line(0, 'return true;'));
  }
  return block;
}

/** Distinct `$keyN` / `$valueN` loop locals per emitted PHP function (stacked for nested helper bodies). */
class VarNaming {
  private nextLoop = 0;

  allocateLoopPair(): { key: string; value: string } {
    const id = ++this.nextLoop;
    return { key: `$key${id}`, value: `$value${id}` };
  }
}

class EmitContext {
  private readonly byKey = new Map<string, string>();
  readonly helperFns: Array<{
    functionName: string;
    lines: PhpLine[];
    docType: string;
  }> = [];
  private nextLegacyId = 1;
  private readonly useSelfHelperCalls: boolean;
  private namingStack: VarNaming[] = [new VarNaming()];
  private readonly nameFunctionsByType: boolean;
  private readonly registry: IsFunctionNameRegistry | null;

  constructor(
    mode: CheckerOutputMode = DEFAULT_CHECKER_OUTPUT,
    nameFunctionsByType = true,
    registry: IsFunctionNameRegistry | null = null,
  ) {
    this.useSelfHelperCalls = mode !== 'function';
    this.nameFunctionsByType = nameFunctionsByType;
    this.registry =
      nameFunctionsByType ? registry ?? new IsFunctionNameRegistry() : null;
  }

  private topNaming(): VarNaming {
    return this.namingStack[this.namingStack.length - 1]!;
  }

  /** Fresh `$key1`/`$value1` loop numbering for a nested helper function body. */
  pushNamingScope(): void {
    this.namingStack.push(new VarNaming());
  }

  popNamingScope(): void {
    if (this.namingStack.length <= 1) {
      throw new Error('internal: cannot pop root VarNaming scope');
    }
    this.namingStack.pop();
  }

  allocateLoopPair(): { key: string; value: string } {
    return this.topNaming().allocateLoopPair();
  }

  private helperCallRef(fnName: string): string {
    return this.useSelfHelperCalls ? `self::${fnName}` : fnName;
  }

  ensureHelper(type: TypeNode): string {
    const n = normalizeNode(type);
    const key = typeDedupeKey(n);
    const existing = this.byKey.get(key);
    if (existing !== undefined) {
      return this.helperCallRef(existing);
    }

    let fnName: string;
    if (this.nameFunctionsByType && this.registry) {
      fnName = this.registry.allocate(key, n);
    } else {
      fnName = `check_${this.nextLegacyId++}`;
    }

    this.byKey.set(key, fnName);
    this.pushNamingScope();
    let lines: PhpLine[];
    try {
      lines = buildHelperLines(n, this);
    } finally {
      this.popNamingScope();
    }
    const docType = formatTypeForPhpstanDoc(n);
    this.helperFns.push({ functionName: fnName, lines, docType });
    return this.helperCallRef(fnName);
  }
}

/** After this intersection member succeeds, `$varName` at this level is known `is_object`. */
function intersectionMemberEstablishesPhpObject(member: TypeNode): boolean {
  const m = normalizeNode(member);
  return m.kind === 'shape' && Boolean(m.object);
}

/** After this intersection member succeeds, `$varName` at this level is known `is_array`. */
function intersectionMemberEstablishesPhpArray(member: TypeNode): boolean {
  const m = normalizeNode(member);
  if (m.kind === 'shape' && m.object) {
    return false;
  }
  if (m.kind === 'shape' || m.kind === 'list') {
    return true;
  }
  if (m.kind === 'array') {
    return !(m as ArrayNode).iterable;
  }
  return false;
}

function emitIntersectionMembers(
  node: Extract<TypeNode, { kind: 'intersection' }>,
  varName: string,
  depth: number,
  ctx: EmitContext,
  base: ValidationEmitOptions,
): PhpLine[] {
  const out: PhpLine[] = [];
  let assumeVarIsArray = Boolean(base.assumeVarIsArray);
  let assumeVarIsObject = Boolean(base.assumeVarIsObject);
  for (const raw of node.types) {
    const member = normalizeNode(raw);
    out.push(
      ...emitValidationLines(
        member,
        varName,
        { ...base, assumeVarIsArray, assumeVarIsObject },
        depth,
        ctx,
      ),
    );
    if (intersectionMemberEstablishesPhpArray(member)) {
      assumeVarIsArray = true;
    }
    if (intersectionMemberEstablishesPhpObject(member)) {
      assumeVarIsObject = true;
    }
  }
  return out;
}

function emitValidationLines(
  node: TypeNode,
  varName: string,
  options: ValidationEmitOptions,
  depth: number,
  ctx: EmitContext,
): PhpLine[] {
  const n = normalizeNode(node);

  switch (n.kind) {
    case 'array':
      return emitArrayValidation(n, varName, depth, ctx, options);
    case 'list':
      return emitListValidation(n, varName, depth, ctx, options);
    case 'shape':
      return emitShapeValidation(n, varName, depth, ctx, options);
    case 'union':
      return emitNestedUnionValidation(n, varName, depth, ctx);
    case 'intersection':
      return emitIntersectionMembers(n, varName, depth, ctx, options);
    default:
      if (isNoOpValueCheck(n)) {
        return [];
      }
      if (isExpressible(n)) {
        return ifBlock(depth, negateExpressionForIf(emitExpression(n, varName)), [
          line(0, 'return false;'),
        ]);
      }
      return emitValidationLines(n, varName, { ...options, includeArrayGuard: true }, depth, ctx);
  }
}

function emitArrayValidation(
  node: ArrayNode,
  varName: string,
  depth: number,
  ctx: EmitContext,
  opts: ValidationEmitOptions,
): PhpLine[] {
  if (isNeverPrimitive(node.value)) {
    if (node.nonEmpty) {
      return [line(depth, 'return false;')];
    }
    if (!node.iterable) {
      return [
        ...ifBlock(
          depth,
          `${varName} !== []`,
          [line(0, 'return false;')],
        ),
      ];
    }
  }

  if (!arrayLoopNeedsElementIteration(node)) {
    const compact = tryEmitCompactReturnLines(node as TypeNode, varName);
    if (compact) {
      return shiftLines(depth, compact);
    }
  }

  const block: PhpLine[] = [];
  const includeGuard = opts.includeArrayGuard;
  const av = Boolean(opts.assumeVarIsArray);

  if (includeGuard && av && !node.iterable) {
    if (node.nonEmpty) {
      block.push(...ifBlock(depth, `${varName} === []`, [line(0, 'return false;')]));
    }
  } else if (includeGuard) {
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
  const needsElemLoop = arrayLoopNeedsElementIteration(node);
  const loopVars = needsElemLoop ? ctx.allocateLoopPair() : null;
  const loopBody =
    needsElemLoop && loopVars
      ? emitArrayLoopBody(node, ctx, loopVars.key, loopVars.value)
      : [];
  if (loopBody.length > 0 && loopVars) {
    const bindKey = arrayLoopBindsKey(node);
    block.push(
      line(
        depth,
        bindKey
          ? `foreach (${varName} as ${loopVars.key} => ${loopVars.value}) {`
          : `foreach (${varName} as ${loopVars.value}) {`,
      ),
    );
    block.push(...shiftLines(1, loopBody));
    block.push(line(depth, '}'));
  }
  return block;
}

/** True when iteration must expose a key variable (key type is not a no-op check). */
function arrayLoopBindsKey(node: ArrayNode): boolean {
  return Boolean(node.key && !isNoOpValueCheck(node.key));
}

/** True when a non-empty foreach body will validate keys and/or values. */
function arrayLoopNeedsElementIteration(node: ArrayNode): boolean {
  return arrayLoopBindsKey(node) || !isNoOpValueCheck(node.value);
}

/** Extract condition from `if (COND) {` allowing nested parentheses in COND. */
function extractIfCondition(text: string): string | null {
  if (!text.startsWith('if (')) return null;
  let depth = 1;
  for (let i = 4; i < text.length; i++) {
    if (text[i] === '(') depth++;
    else if (text[i] === ')') {
      depth--;
      if (depth === 0) {
        const tail = text.slice(i + 1).trim();
        if (tail === '{') {
          return text.slice(4, i);
        }
        return null;
      }
    }
  }
  return null;
}

/** Matches `if (cond) { return false; }` as three `PhpLine`s. */
function tryConsumeSimpleFailureIf(
  lines: PhpLine[],
  i: number,
): { depth: number; condition: string; end: number } | null {
  if (i + 2 >= lines.length) return null;
  const [a, b, c] = [lines[i]!, lines[i + 1]!, lines[i + 2]!];
  const cond = extractIfCondition(a.text);
  if (cond === null) return null;
  if (b.text !== 'return false;') return null;
  if (c.text !== '}') return null;
  return { depth: a.depth, condition: cond, end: i + 3 };
}

/**
 * Merge consecutive `if (c) { return false; }` blocks (same depth) into
 * `if (c1 || c2 || …) { return false; }`.
 */
function mergeConsecutiveFailureIfs(lines: PhpLine[]): PhpLine[] {
  const out: PhpLine[] = [];
  let i = 0;
  while (i < lines.length) {
    const first = tryConsumeSimpleFailureIf(lines, i);
    if (!first) {
      out.push(lines[i]!);
      i++;
      continue;
    }
    const conditions: string[] = [first.condition];
    let j = first.end;
    while (j < lines.length) {
      const next = tryConsumeSimpleFailureIf(lines, j);
      if (!next || next.depth !== first.depth) break;
      conditions.push(next.condition);
      j = next.end;
    }
    if (conditions.length >= 2) {
      out.push(...ifBlock(first.depth, conditions.join(' || '), [line(0, 'return false;')]));
      i = j;
    } else {
      out.push(lines[i]!);
      i++;
    }
  }
  return out;
}

function emitArrayLoopBody(
  node: ArrayNode,
  ctx: EmitContext,
  keyVar: string,
  valueVar: string,
): PhpLine[] {
  const keyNeedsCheck = arrayLoopBindsKey(node);
  const valueNeedsCheck = !isNoOpValueCheck(node.value);
  const keyMergeable =
    Boolean(node.key) && isExpressible(node.key!) && !needsStatementBlock(node.key!);
  const valueMergeable =
    isExpressible(node.value) && !needsStatementBlock(node.value);

  if (keyNeedsCheck && keyMergeable && valueNeedsCheck && valueMergeable) {
    return ifBlock(
      0,
      `${negateExpressionForIf(emitExpression(node.key!, keyVar))} || ${negateExpressionForIf(emitExpression(node.value, valueVar))}`,
      [line(0, 'return false;')],
    );
  }

  const block: PhpLine[] = [];
  if (node.key && !isNoOpValueCheck(node.key)) {
    block.push(
      ...ifBlock(0, negateExpressionForIf(emitExpression(node.key, keyVar)), [
        line(0, 'return false;'),
      ]),
    );
  }
  block.push(...emitValueValidation(node.value, valueVar, 0, ctx));
  return mergeConsecutiveFailureIfs(block);
}

function emitListValidation(
  node: Extract<TypeNode, { kind: 'list' }>,
  varName: string,
  depth: number,
  ctx: EmitContext,
  opts: ValidationEmitOptions,
): PhpLine[] {
  if (isNeverPrimitive(node.element)) {
    if (node.nonEmpty) {
      return [line(depth, 'return false;')];
    }
    return [
      ...ifBlock(
        depth,
        `${varName} !== []`,
        [line(0, 'return false;')],
      ),
    ];
  }

  if (isNoOpValueCheck(node.element)) {
    const compact = tryEmitCompactReturnLines(node, varName);
    if (compact) {
      return shiftLines(depth, compact);
    }
  }

  const block: PhpLine[] = [];
  if (opts.includeArrayGuard) {
    const baseGuard = opts.assumeVarIsArray
      ? `!array_is_list(${varName})`
      : `!is_array(${varName}) || !array_is_list(${varName})`;
    const guard = node.nonEmpty
      ? `${baseGuard} || ${varName} === []`
      : baseGuard;
    block.push(...ifBlock(depth, guard, [line(0, 'return false;')]));
  } else if (node.nonEmpty) {
    block.push(...ifBlock(depth, `${varName} === []`, [line(0, 'return false;')]));
  }
  const loopPair = ctx.allocateLoopPair();
  const loopBody = emitValueValidation(node.element, loopPair.value, 0, ctx);
  if (loopBody.length > 0) {
    block.push(line(depth, `foreach (${varName} as ${loopPair.value}) {`));
    block.push(...shiftLines(1, loopBody));
    block.push(line(depth, '}'));
  }
  return block;
}

/**
 * For the last required field of a shape: emit `return <pred>;` instead of
 * `if (!<pred>) { return false; }` plus a trailing `return true;`.
 */
function tryEmitTailReturnCheckLines(
  type: TypeNode,
  varName: string,
  depth: number,
): PhpLine[] | null {
  const n = normalizeNode(type);
  if (isNoOpValueCheck(n)) {
    return null;
  }
  if (needsStatementBlock(n) || !isExpressible(n)) {
    return null;
  }
  return [line(depth, `return ${emitExpression(n, varName)};`)];
}

function emitShapeValidation(
  node: Extract<TypeNode, { kind: 'shape' }>,
  varName: string,
  depth: number,
  ctx: EmitContext,
  opts: ValidationEmitOptions,
): PhpLine[] {
  const block: PhpLine[] = [];
  const objectShape = Boolean(node.object);

  if (opts.includeArrayGuard) {
    if (objectShape) {
      if (!opts.assumeVarIsObject) {
        block.push(...ifBlock(depth, `!is_object(${varName})`, [line(0, 'return false;')]));
      }
    } else if (!opts.assumeVarIsArray) {
      block.push(...ifBlock(depth, `!is_array(${varName})`, [line(0, 'return false;')]));
    }
  }

  const usedFieldVarNames = new Set<string>();
  const tailSlot = opts.shapeTailReturnEmitted;
  const fields = node.fields;

  for (let i = 0; i < fields.length; i++) {
    const field = fields[i]!;
    const isLast = i === fields.length - 1;
    const keyStr = String(field.key);
    const arrayKeyExpr =
      typeof field.key === 'number' ? String(field.key) : phpString(keyStr);
    const propNameLit = phpString(keyStr);

    if (!field.optional) {
      block.push(
        ...ifBlock(
          depth,
          objectShape
            ? `!property_exists(${varName}, ${propNameLit})`
            : `!array_key_exists(${arrayKeyExpr}, ${varName})`,
          [line(0, 'return false;')],
        ),
      );
    }
    const fieldVar = uniqueShapeFieldVar(varName, field.key, usedFieldVarNames);
    const readExpr = objectShape
      ? phpObjectPropertyRead(varName, field.key)
      : `${varName}[${arrayKeyExpr}]`;
    const assignment = line(0, `${fieldVar} = ${readExpr};`);

    const tailLines = isLast
      ? tryEmitTailReturnCheckLines(field.type, fieldVar, 0)
      : null;

    if (field.optional) {
      const cond = objectShape
        ? `property_exists(${varName}, ${propNameLit})`
        : `array_key_exists(${arrayKeyExpr}, ${varName})`;
      if (tailLines !== null) {
        block.push(
          ...ifBlock(depth, cond, shiftLines(1, [assignment, ...tailLines])),
        );
      } else {
        block.push(
          ...ifBlock(depth, cond, shiftLines(1, [
            assignment,
            ...emitValueValidation(field.type, fieldVar, 0, ctx),
          ])),
        );
      }
    } else if (tailLines !== null) {
      block.push(...shiftLines(depth, [assignment, ...tailLines]));
      if (tailSlot) {
        tailSlot.value = true;
      }
    } else {
      block.push(
        ...shiftLines(depth, [
          assignment,
          ...emitValueValidation(field.type, fieldVar, 0, ctx),
        ]),
      );
    }
  }
  return block;
}

function emitValueValidation(
  node: TypeNode,
  varName: string,
  depth: number,
  ctx: EmitContext,
): PhpLine[] {
  if (isNoOpValueCheck(node)) {
    return [];
  }
  if (isExpressible(node) && !needsStatementBlock(node)) {
    return ifBlock(depth, negateExpressionForIf(emitExpression(node, varName)), [
      line(0, 'return false;'),
    ]);
  }
  return emitValidationLines(node, varName, { includeArrayGuard: true }, depth, ctx);
}

function unionEveryMemberExpressibleWithoutBlock(
  node: Extract<TypeNode, { kind: 'union' }>,
): boolean {
  return flattenUnion(node).every(
    (m) => isExpressible(m) && !needsStatementBlock(m),
  );
}

/** Key/value checks are no-ops (e.g. array<mixed>); only array / iterable top guard applies. */
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

/**
 * Local name `{parent}_{safeField(key)}`; when distinct keys sanitize to the same segment
 * (e.g. `hello:world` vs `hello.world` → `hello_world`), append `_2`, `_3`, …
 */
function uniqueShapeFieldVar(
  varName: string,
  key: string | number,
  used: Set<string>,
): string {
  const base = `${varName}_${safeFieldVar(key)}`;
  let candidate = base;
  let n = 2;
  while (used.has(candidate)) {
    candidate = `${base}_${n}`;
    n++;
  }
  used.add(candidate);
  return candidate;
}

/** Dynamic `->` read for object shapes (avoids reserved words like `default`). */
function phpObjectPropertyRead(varName: string, key: string | number): string {
  return `${varName}->{${phpString(String(key))}}`;
}

function phpString(value: string): string {
  return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}
