import type { TypeNode } from '../../parser/ast.ts';
import type {
  Block,
  CheckerIR,
  CheckerProgram,
  Expr,
  Stmt,
  ValueRef,
} from '../ir/types.ts';
import {
  andExpr,
  arrayAccessRef,
  binExpr,
  boolLit,
  callArg,
  callCheckerExpr,
  callExpr,
  failIfStmt,
  instanceofExpr,
  literalArg,
  orExpr,
  propertyAccessRef,
  refArg,
  returnStmt,
  variableRef,
} from '../ir/index.ts';
import { GenerationError } from '../errors.ts';
import {
  bareEmptyCollectionKeywordAsShape,
  isBareEmptyCollectionKeyword,
  isIterableKeyword,
  isListKeyword,
  isNonEmptyKeyword,
  shapeIsObject,
} from './ast/collection.ts';
import { isMixed, isNever } from './ast/classify.ts';
import { cannotBuild, describeNode } from './errors.ts';
import type { FunctionNameRegistry } from './registry/index.ts';

// ---------------------------------------------------------------------------
// Builder
// ---------------------------------------------------------------------------

export class Builder {
  private readonly programs: Record<string, CheckerProgram> = {};
  private readonly order: string[] = [];
  private readonly entries: string[] = [];
  private readonly typesByName: Record<string, TypeNode> = {};
  private varCounter = 0;
  private readonly registry: FunctionNameRegistry;

  constructor(registry: FunctionNameRegistry) {
    this.registry = registry;
  }

  add(type: TypeNode): string {
    const name = this.registry.get(type);
    if (typeof this.programs[name] === 'undefined') {
      this.emit(name, type);
    }
    this.promote(name);
    return name;
  }

  build(): CheckerIR {
    return {
      programs: { ...this.programs },
      order: [...this.order],
      entries: [...this.entries],
    };
  }

  getTypesByName(): Record<string, TypeNode> {
    return { ...this.typesByName };
  }

  private emit(name: string, type: TypeNode): void {
    const body = this.finishBody(
      this.checkAtRoot(type, variableRef('$value')),
    );
    this.programs[name] = { parameter: '$value', body };
    this.typesByName[name] = type;
    if (!this.order.includes(name)) {
      this.order.push(name);
    }
  }

  private promote(name: string): void {
    if (!this.entries.includes(name)) {
      this.entries.push(name);
    }
  }

  private getOrEmitProgram(type: TypeNode): string {
    const name = this.registry.get(type);
    if (typeof this.programs[name] === 'undefined') {
      this.emit(name, type);
    }
    return name;
  }

  private freshVar(): ValueRef {
    return variableRef(`$var${this.varCounter++}`);
  }

  private finishBody(block: Block): Block {
    const last = block[block.length - 1];
    if (last?.kind === 'return') {
      return block;
    }
    return [...block, returnStmt(boolLit(true))];
  }

  private varName(ref: ValueRef): string {
    if (ref.kind !== 'variable') {
      throw new Error('expected variable ValueRef from freshVar()');
    }
    return ref.name;
  }

  // -------------------------------------------------------------------------
  // Check sites
  // -------------------------------------------------------------------------

  private checkAtRoot(type: TypeNode, subject: ValueRef): Block {
    return this.emitStatements(type, subject, {
      unionRoot: true,
      skipContainerGuard: false,
      provenArray: false,
      provenObject: false,
      inLoop: false,
      insideShapeField: false,
    });
  }

  private checkInValueLoop(
    type: TypeNode,
    valueRef: ValueRef,
    loopOver: ValueRef,
  ): Block {
    return this.emitStatements(type, valueRef, {
      unionRoot: false,
      skipContainerGuard: false,
      provenArray: false,
      provenObject: false,
      inLoop: true,
      insideShapeField: false,
      loopOver,
    });
  }

  private checkShapeField(
    type: TypeNode,
    fieldRef: ValueRef,
    parentIsObject: boolean,
  ): Block {
    return this.emitStatements(type, fieldRef, {
      unionRoot: false,
      skipContainerGuard: true,
      provenArray: !parentIsObject,
      provenObject: parentIsObject,
      inLoop: false,
      insideShapeField: true,
      loopOver: fieldRef,
    });
  }

  private guardForeachKey(type: TypeNode, keyRef: ValueRef): Block {
    return [failIfStmt(this.booleanForType(type, keyRef))];
  }

  private checkIntersection(
    node: Extract<TypeNode, { kind: 'intersection' }>,
    subject: ValueRef,
  ): Block {
    const out: Block = [];
    let provenArray = false;
    let provenObject = false;
    for (const member of node.types) {
      out.push(
        ...this.emitStatements(member, subject, {
          unionRoot: false,
          skipContainerGuard: false,
          provenArray,
          provenObject,
          inLoop: false,
          insideShapeField: false,
        }),
      );
      if (provenContainerAfter(member).array) {
        provenArray = true;
      }
      if (provenContainerAfter(member).object) {
        provenObject = true;
      }
    }
    return out;
  }

  private emitStatements(
    type: TypeNode,
    subject: ValueRef,
    opts: EmitOptions,
  ): Block {
    switch (type.kind) {
      case 'unsupported':
        cannotBuild(
          type,
          `Cannot generate a runtime check for unsupported type: ${type.raw}`,
          type.raw,
        );
      case 'callable':
        cannotBuild(
          type,
          'Cannot generate a runtime check for callable with parameter or return types: parameter and return types cannot be verified without invoking the callable',
          'callable(...)',
        );
      case 'generic':
        cannotBuild(
          type,
          `Cannot generate a runtime check for the generic type ${type.name}: not a supported generic for codegen`,
          `${type.name}<...>`,
        );
      case 'union':
        if (opts.unionRoot) {
          return this.unionOrAtRoot(type, subject);
        }
        return [this.unionOrInline(type, subject)];
      case 'intersection':
        return this.checkIntersection(type, subject);
      case 'collection':
        return this.emitCollection(type, subject, opts);
      case 'shape':
        return this.emitShape(type, subject, opts);
      case 'array':
        return this.emitPostfixArray(type, subject, opts);
      case 'keyword':
        if (isBareEmptyCollectionKeyword(type)) {
          return this.emitShape(
            bareEmptyCollectionKeywordAsShape(type),
            subject,
            opts,
          );
        }
        return this.emitKeywordStatements(type, subject);
      case 'class':
      case 'literal':
      case 'range':
        return this.emitAtomicStatements(type, subject);
    }
    throw new Error('never reached');
  }

  private emitKeywordStatements(
    node: Extract<TypeNode, { kind: 'keyword' }>,
    subject: ValueRef,
  ): Block {
    switch (node.keyword) {
      case 'mixed':
        return [];
      case 'never':
      case 'noreturn':
        return [returnStmt(boolLit(false))];
      default: {
        const atoms = this.booleanAtoms(node, subject);
        const out: Block = [];
        for (const atom of atoms) {
          out.push(failIfStmt(atom));
        }
        return out;
      }
    }
    throw new Error('never reached');
  }

  private emitAtomicStatements(type: TypeNode, subject: ValueRef): Block {
    const atoms = this.booleanAtoms(type, subject);
    const out: Block = [];
    for (const atom of atoms) {
      out.push(failIfStmt(atom));
    }
    return out;
  }

  // -------------------------------------------------------------------------
  // Unions
  // -------------------------------------------------------------------------

  private unionOrAtRoot(
    node: Extract<TypeNode, { kind: 'union' }>,
    subject: ValueRef,
  ): Block {
    const arms = flattenAlternatives(node).map((member) =>
      this.unionArmExpr(member, subject),
    );
    return [failIfStmt(orExpr(arms))];
  }

  private unionOrInline(
    node: Extract<TypeNode, { kind: 'union' }>,
    subject: ValueRef,
  ): Stmt {
    const arms = flattenAlternatives(node).map((member) =>
      this.unionArmExpr(member, subject),
    );
    return failIfStmt(orExpr(arms));
  }

  private unionArmExpr(member: TypeNode, subject: ValueRef): Expr {
    const compact = this.compactCollectionTest(member, subject);
    if (compact !== null) {
      return compact;
    }
    try {
      return this.booleanForType(member, subject);
    } catch (error) {
      if (!(error instanceof GenerationError)) {
        throw error;
      }
    }
    return callCheckerExpr(this.getOrEmitProgram(member), subject);
  }

  // -------------------------------------------------------------------------
  // Shapes
  // -------------------------------------------------------------------------

  private emitShape(
    node: Extract<TypeNode, { kind: 'shape' }>,
    base: ValueRef,
    opts: EmitOptions,
  ): Block {
    const out: Block = [];
    const objectShape = shapeIsObject(node);

    if (!objectShape && node.fields.length === 0) {
      if (isListKeyword(node.keyword)) {
        this.appendListGuards(out, base, opts, isNonEmptyKeyword(node.keyword));
        return out;
      }
      if (isNonEmptyKeyword(node.keyword)) {
        this.appendArrayGuards(
          out,
          base,
          opts,
          true,
          isIterableKeyword(node.keyword),
        );
        return out;
      }
      out.push(failIfStmt(binExpr('===', refArg(base), literalArg('[]'))));
      return out;
    }

    if (!opts.skipContainerGuard) {
      if (objectShape) {
        if (!opts.provenObject) {
          out.push(failIfStmt(callExpr('is_object', [refArg(base)])));
        }
      } else if (isListKeyword(node.keyword)) {
        this.appendListGuards(out, base, opts, isNonEmptyKeyword(node.keyword));
      } else if (!opts.provenArray) {
        out.push(failIfStmt(callExpr('is_array', [refArg(base)])));
      }
    } else if (!objectShape && isListKeyword(node.keyword)) {
      this.appendListGuards(out, base, opts, isNonEmptyKeyword(node.keyword));
    }

    let nextUnkeyedSlot = 0;
    for (const field of node.fields) {
      let fieldRef: ValueRef;
      let keyLit: string;
      if (field.key === null) {
        const slot = nextUnkeyedSlot++;
        keyLit = phpKeyLiteral(slot);
        fieldRef = objectShape
          ? propertyAccessRef(base, String(slot))
          : arrayAccessRef(base, slot);
      } else {
        keyLit = phpKeyLiteral(field.key);
        fieldRef = objectShape
          ? propertyAccessRef(base, String(field.key))
          : arrayAccessRef(base, field.key);
      }

      if (!field.optional) {
        if (objectShape) {
          out.push(
            failIfStmt(
              callExpr('property_exists', [refArg(base), literalArg(keyLit)]),
            ),
          );
        } else {
          out.push(
            failIfStmt(
              callExpr('array_key_exists', [
                literalArg(keyLit),
                refArg(base),
              ]),
            ),
          );
        }
      }

      const fieldBody = this.checkShapeField(
        field.value,
        fieldRef,
        objectShape,
      );

      if (field.optional) {
        const exists = objectShape
          ? callExpr('property_exists', [refArg(base), literalArg(keyLit)])
          : callExpr('array_key_exists', [literalArg(keyLit), refArg(base)]);
        out.push({ kind: 'if', cond: exists, body: fieldBody });
      } else {
        out.push(...fieldBody);
      }
    }
    return out;
  }

  // -------------------------------------------------------------------------
  // Collections
  // -------------------------------------------------------------------------

  private emitCollection(
    node: Extract<TypeNode, { kind: 'collection' }>,
    subject: ValueRef,
    opts: EmitOptions,
  ): Block {
    this.rejectParameterizedIterable(node);

    if (isListKeyword(node.keyword)) {
      return this.emitList(node, subject, opts);
    }
    if (isIterableKeyword(node.keyword) && !('key' in node)) {
      return this.emitBareIterable(node, subject, opts);
    }
    if ('key' in node) {
      return this.emitKeyedEntries(node, subject, opts);
    }
    return this.emitHomogeneousArray(node, subject, opts);
  }

  private rejectParameterizedIterable(
    node: Extract<TypeNode, { kind: 'collection' }>,
  ): void {
    if (isIterableKeyword(node.keyword) && 'key' in node) {
      cannotBuild(
        node,
        'Cannot generate a runtime check for parameterized iterable: validating keys or elements would require foreach iteration and is not side-effect-free',
      );
    }
    if ('value' in node && isIterableKeyword(node.keyword)) {
      cannotBuild(
        node,
        'Cannot generate a runtime check for parameterized iterable: validating keys or elements would require foreach iteration and is not side-effect-free',
      );
    }
  }

  private emitPostfixArray(
    node: Extract<TypeNode, { kind: 'array' }>,
    subject: ValueRef,
    opts: EmitOptions,
  ): Block {
    if (isNever(node.value)) {
      return [failIfStmt(binExpr('===', refArg(subject), literalArg('[]')))];
    }

    const out: Block = [];
    if (!opts.skipContainerGuard && !opts.provenArray) {
      out.push(failIfStmt(callExpr('is_array', [refArg(subject)])));
    }

    if (node.value.kind === 'keyword' && node.value.keyword === 'mixed') {
      return out;
    }

    const valueRef = this.freshVar();
    const loopOver = opts.loopOver ?? subject;
    const body = this.checkInValueLoop(node.value, valueRef, loopOver);
    this.pushForeach(out, loopOver, valueRef, null, body);
    return out;
  }

  private emitList(
    node: Extract<TypeNode, { kind: 'collection' }>,
    subject: ValueRef,
    opts: EmitOptions,
  ): Block {
    const nonEmpty = isNonEmptyKeyword(node.keyword);

    const element = listElementType(node);
    if (isNever(element)) {
      if (nonEmpty) {
        return [failIfStmt(boolLit(false))];
      }
      return [
        failIfStmt(binExpr('!==', refArg(subject), literalArg('[]'))),
      ];
    }

    const out: Block = [];
    this.appendListGuards(out, subject, opts, nonEmpty);

    if (element.kind === 'keyword' && element.keyword === 'mixed') {
      return out;
    }

    const valueRef = this.freshVar();
    const loopOver = opts.loopOver ?? subject;
    const body = this.checkInValueLoop(element, valueRef, loopOver);
    this.pushForeach(out, loopOver, valueRef, null, body);
    return out;
  }

  private emitBareIterable(
    node: Extract<TypeNode, { kind: 'collection' }>,
    subject: ValueRef,
    opts: EmitOptions,
  ): Block {
    const nonEmpty = isNonEmptyKeyword(node.keyword);
    const out: Block = [];
    if (!opts.skipContainerGuard && !opts.provenArray) {
      out.push(failIfStmt(callExpr('is_iterable', [refArg(subject)])));
    }
    if (nonEmpty) {
      out.push(
        failIfStmt(binExpr('!==', refArg(subject), literalArg('[]'))),
      );
    }
    if ('value' in node && !isMixed(node)) {
      const compact = this.compactCollectionTest(node, subject);
      if (compact !== null) {
        for (const atom of exprAtoms(compact)) {
          out.push(failIfStmt(atom));
        }
      }
    }
    return out;
  }

  private emitKeyedEntries(
    node: Extract<TypeNode, { kind: 'collection'; key: TypeNode; value: TypeNode }>,
    subject: ValueRef,
    opts: EmitOptions,
  ): Block {
    return this.emitForeachKeyed(
      subject,
      opts,
      node.key,
      node.value,
      isNonEmptyKeyword(node.keyword),
      false,
    );
  }

  private emitHomogeneousArray(
    node: Extract<TypeNode, { kind: 'collection'; value: TypeNode }>,
    subject: ValueRef,
    opts: EmitOptions,
  ): Block {
    const nonEmpty = isNonEmptyKeyword(node.keyword);
    if (isNever(node.value)) {
      if (nonEmpty) {
        return [failIfStmt(boolLit(false))];
      }
      const emptyCheck = opts.insideShapeField
        ? binExpr('!==', refArg(subject), literalArg('[]'))
        : binExpr('===', refArg(subject), literalArg('[]'));
      return [failIfStmt(emptyCheck)];
    }

    const out: Block = [];

    if (isMixed(node.value)) {
      const compact = this.compactCollectionTest(node, subject);
      if (compact !== null) {
        for (const atom of exprAtoms(compact)) {
          out.push(failIfStmt(atom));
        }
        return out;
      }
      this.appendArrayGuards(out, subject, opts, nonEmpty, false);
      return out;
    }

    const compact = this.compactCollectionTest(node, subject);
    if (compact !== null) {
      for (const atom of exprAtoms(compact)) {
        out.push(failIfStmt(atom));
      }
      return out;
    }

    this.appendArrayGuards(out, subject, opts, nonEmpty, false);
    return [
      ...out,
      ...this.emitForeachKeyed(subject, opts, null, node.value, nonEmpty, true),
    ];
  }

  private emitForeachKeyed(
    subject: ValueRef,
    opts: EmitOptions,
    key: TypeNode | null,
    value: TypeNode,
    nonEmpty: boolean,
    skipGuards: boolean,
  ): Block {
    const out: Block = [];
    if (!skipGuards) {
      this.appendArrayGuards(out, subject, opts, nonEmpty, false);
    }

    const loopOver = opts.loopOver ?? subject;
    const valueRef = this.freshVar();
    const keyRef =
      key !== null && !isMixed(key) ? this.freshVar() : null;
    const body: Block = [];

    if (keyRef !== null && key !== null) {
      body.push(...this.guardForeachKey(key, keyRef));
    }
    if (!isMixed(value)) {
      body.push(...this.checkInValueLoop(value, valueRef, loopOver));
    }
    this.pushForeach(out, loopOver, valueRef, keyRef, body);
    return out;
  }

  private pushForeach(
    out: Block,
    loopOver: ValueRef,
    valueRef: ValueRef,
    keyRef: ValueRef | null,
    body: Block,
  ): void {
    out.push({
      kind: 'foreach',
      iterable: loopOver,
      keyVar: keyRef !== null ? this.varName(keyRef) : null,
      valueVar: this.varName(valueRef),
      body: stripTrailingTrueReturn(body),
    });
  }

  private appendListGuards(
    out: Block,
    subject: ValueRef,
    opts: EmitOptions,
    nonEmpty: boolean,
  ): void {
    if (opts.skipContainerGuard) {
      if (!opts.provenArray) {
        out.push(failIfStmt(callExpr('is_array', [refArg(subject)])));
      }
      out.push(failIfStmt(callExpr('array_is_list', [refArg(subject)])));
      if (nonEmpty) {
        out.push(
          failIfStmt(binExpr('!==', refArg(subject), literalArg('[]'))),
        );
      }
      return;
    }
    if (opts.provenArray) {
      out.push(failIfStmt(callExpr('array_is_list', [refArg(subject)])));
      if (nonEmpty) {
        out.push(
          failIfStmt(binExpr('!==', refArg(subject), literalArg('[]'))),
        );
      }
      return;
    }
    out.push(failIfStmt(callExpr('is_array', [refArg(subject)])));
    out.push(failIfStmt(callExpr('array_is_list', [refArg(subject)])));
    if (nonEmpty) {
      out.push(
        failIfStmt(binExpr('!==', refArg(subject), literalArg('[]'))),
      );
    }
  }

  private appendArrayGuards(
    out: Block,
    subject: ValueRef,
    opts: EmitOptions,
    nonEmpty: boolean,
    iterable: boolean,
  ): void {
    if (!opts.skipContainerGuard && opts.provenArray && !iterable) {
      if (nonEmpty) {
        out.push(
          failIfStmt(binExpr('!==', refArg(subject), literalArg('[]'))),
        );
      }
      return;
    }
    if (!opts.skipContainerGuard) {
      out.push(
        failIfStmt(
          callExpr(iterable ? 'is_iterable' : 'is_array', [refArg(subject)]),
        ),
      );
      if (nonEmpty) {
        out.push(
          failIfStmt(binExpr('!==', refArg(subject), literalArg('[]'))),
        );
      }
      return;
    }
    if (!opts.provenArray) {
      out.push(
        failIfStmt(
          callExpr(iterable ? 'is_iterable' : 'is_array', [refArg(subject)]),
        ),
      );
    }
    if (nonEmpty) {
      out.push(
        failIfStmt(binExpr('!==', refArg(subject), literalArg('[]'))),
      );
    }
  }

  // -------------------------------------------------------------------------
  // Boolean expressions
  // -------------------------------------------------------------------------

  private booleanAtoms(type: TypeNode, subject: ValueRef): Expr[] {
    if (type.kind === 'keyword' && type.keyword === 'mixed') {
      return [];
    }
    const single = this.booleanForType(type, subject);
    return exprAtoms(single);
  }

  private booleanForType(type: TypeNode, subject: ValueRef): Expr {
    const compact = this.compactCollectionTest(type, subject);
    if (compact !== null) {
      return compact;
    }

    switch (type.kind) {
      case 'keyword':
        return this.booleanForKeyword(type.keyword, subject);
      case 'class':
        return this.booleanForClass(type, subject);
      case 'literal':
        return this.booleanForLiteral(type, subject);
      case 'range':
        return this.booleanForRange(type, subject);
      case 'union':
        return orExpr(
          type.types.map((m) => this.booleanForType(m, subject)),
        );
      case 'intersection':
        return andExpr(
          type.types.map((m) => this.booleanForType(m, subject)),
        );
      case 'collection':
      case 'shape':
      case 'array':
        cannotBuild(
          type,
          `Cannot generate a runtime check for ${describeNode(type)}: not representable as a single boolean PHP expression`,
        );
      case 'unsupported':
      case 'callable':
      case 'generic':
        cannotBuild(type);
    }
    throw new Error('never reached');
  }

  private booleanForKeyword(keyword: string, subject: ValueRef): Expr {
    if (
      keyword === 'literal-string' ||
      keyword === 'non-empty-literal-string'
    ) {
      cannotBuild(
        { kind: 'keyword', keyword } as TypeNode,
        'Cannot generate a runtime check for literal-string types: PHP cannot verify PHPStan literal-string semantics at runtime',
      );
    }
    if (UNCHECKABLE_KEYWORDS.has(keyword)) {
      cannotBuild(
        { kind: 'keyword', keyword } as TypeNode,
        `Cannot generate a runtime check for the type ${keyword}: this built-in is not supported for codegen`,
      );
    }
    const expr = keywordToBoolean(keyword, subject);
    if (expr === null) {
      cannotBuild({ kind: 'keyword', keyword } as TypeNode);
    }
    return expr;
  }

  private booleanForClass(
    node: Extract<TypeNode, { kind: 'class' }>,
    subject: ValueRef,
  ): Expr {
    if (node.name === 'closed-resource' || node.name === 'open-resource') {
      cannotBuild(
        node,
        `Cannot generate a runtime check for the type ${node.name}: PHP cannot distinguish open and closed resources at runtime`,
      );
    }
    const s = refArg(subject);
    if (node.name === 'callable-array') {
      return andExpr([callExpr('is_callable', [s]), callExpr('is_array', [s])]);
    }
    if (node.name === 'callable-object') {
      return andExpr([
        callExpr('is_callable', [s]),
        callExpr('is_object', [s]),
      ]);
    }
    return instanceofExpr(s, node.name);
  }

  private booleanForLiteral(
    node: Extract<TypeNode, { kind: 'literal' }>,
    subject: ValueRef,
  ): Expr {
    if (node.type !== 'string' && node.type !== 'number') {
      cannotBuild(node);
    }
    const lit = phpLiteralFromNode(node);
    if (lit === null) {
      cannotBuild(node);
    }
    return binExpr('===', refArg(subject), literalArg(lit));
  }

  private booleanForRange(
    node: Extract<TypeNode, { kind: 'range' }>,
    subject: ValueRef,
  ): Expr {
    const s = refArg(subject);
    const parts: Expr[] = [callExpr('is_int', [s])];
    if (node.min !== null) {
      parts.push(binExpr('>=', s, literalArg(String(node.min))));
    }
    if (node.max !== null) {
      parts.push(binExpr('<=', s, literalArg(String(node.max))));
    }
    if (parts.length === 1) {
      return parts[0]!;
    }
    return andExpr(parts);
  }

  private compactCollectionTest(
    type: TypeNode,
    subject: ValueRef,
  ): Expr | null {
    if (isBareEmptyCollectionKeyword(type)) {
      return this.compactCollectionTest(
        bareEmptyCollectionKeywordAsShape(type),
        subject,
      );
    }
    if (isMixed(type)) {
      return boolLit(true);
    }
    if (type.kind === 'collection') {
      if (isIterableKeyword(type.keyword) && !('key' in type)) {
        const listOk = callExpr('is_iterable', [refArg(subject)]);
        return isNonEmptyKeyword(type.keyword)
          ? andExpr([
              listOk,
              binExpr('!==', refArg(subject), literalArg('[]')),
            ])
          : listOk;
      }
      if ('value' in type && !isNever(type.value) && isMixed(type.value)) {
        const guard = isIterableKeyword(type.keyword)
          ? 'is_iterable'
          : 'is_array';
        const arrOk = callExpr(guard, [refArg(subject)]);
        return isNonEmptyKeyword(type.keyword)
          ? andExpr([
              arrOk,
              binExpr('!==', refArg(subject), literalArg('[]')),
            ])
          : arrOk;
      }
      if (
        'value' in type &&
        isNever(type.value) &&
        !isIterableKeyword(type.keyword)
      ) {
        return isNonEmptyKeyword(type.keyword)
          ? boolLit(false)
          : binExpr('===', refArg(subject), literalArg('[]'));
      }
    }
    if (
      type.kind === 'shape' &&
      !shapeIsObject(type) &&
      type.fields.length === 0 &&
      isArrayCollectionKeyword(type.keyword)
    ) {
      const arrOk = callExpr('is_array', [refArg(subject)]);
      return isNonEmptyKeyword(type.keyword)
        ? andExpr([
            arrOk,
            binExpr('!==', refArg(subject), literalArg('[]')),
          ])
        : arrOk;
    }
    if (
      type.kind === 'shape' &&
      !shapeIsObject(type) &&
      type.fields.length === 0 &&
      isListKeyword(type.keyword)
    ) {
      const listOk = andExpr([
        callExpr('is_array', [refArg(subject)]),
        callExpr('array_is_list', [refArg(subject)]),
      ]);
      return isNonEmptyKeyword(type.keyword)
        ? andExpr([
            listOk,
            binExpr('!==', refArg(subject), literalArg('[]')),
          ])
        : listOk;
    }
    if (
      (type.kind === 'collection' && isListKeyword(type.keyword)) ||
      (type.kind === 'shape' && !shapeIsObject(type) && isListKeyword(type.keyword))
    ) {
      const el =
        type.kind === 'collection'
          ? listElementType(type)
          : shapeListElementType(type);
      const listCompact = compactListElementTest(type.keyword, el, subject);
      if (listCompact !== null) {
        return listCompact;
      }
    }
    if (type.kind === 'array' && isNever(type.value)) {
      return binExpr('===', refArg(subject), literalArg('[]'));
    }
    return null;
  }
}

// ---------------------------------------------------------------------------
// Module helpers
// ---------------------------------------------------------------------------

type EmitOptions = {
  unionRoot: boolean;
  skipContainerGuard: boolean;
  provenArray: boolean;
  provenObject: boolean;
  inLoop: boolean;
  insideShapeField: boolean;
  loopOver?: ValueRef;
};

const UNCHECKABLE_KEYWORDS = new Set([
  'void',
  'static',
  '$this',
  'self',
  'parent',
]);

function flattenAlternatives(node: TypeNode): TypeNode[] {
  if (node.kind === 'union') {
    return node.types.flatMap(flattenAlternatives);
  }
  return [node];
}

function provenContainerAfter(member: TypeNode): {
  array: boolean;
  object: boolean;
} {
  if (member.kind === 'shape' && shapeIsObject(member)) {
    return { array: false, object: true };
  }
  if (member.kind === 'shape') {
    return { array: true, object: false };
  }
  if (isBareEmptyCollectionKeyword(member)) {
    return { array: true, object: false };
  }
  if (member.kind === 'collection' && isListKeyword(member.keyword)) {
    return { array: true, object: false };
  }
  if (member.kind === 'collection' && !isIterableKeyword(member.keyword)) {
    return { array: true, object: false };
  }
  if (member.kind === 'array') {
    return { array: true, object: false };
  }
  return { array: false, object: false };
}

function listElementType(
  node: Extract<TypeNode, { kind: 'collection' }>,
): TypeNode {
  if ('value' in node) {
    return node.value;
  }
  return { kind: 'keyword', keyword: 'mixed' };
}

function shapeListElementType(
  node: Extract<TypeNode, { kind: 'shape' }>,
): TypeNode {
  if (node.fields.length === 1) {
    return node.fields[0]!.value;
  }
  return { kind: 'keyword', keyword: 'mixed' };
}

function compactListElementTest(
  keyword: Extract<TypeNode, { kind: 'collection' }>['keyword'] | Extract<TypeNode, { kind: 'shape' }>['keyword'],
  el: TypeNode,
  subject: ValueRef,
): Expr | null {
  if (isNever(el)) {
    return isNonEmptyKeyword(keyword)
      ? boolLit(false)
      : binExpr('===', refArg(subject), literalArg('[]'));
  }
  if (isMixed(el)) {
    const listOk = andExpr([
      callExpr('is_array', [refArg(subject)]),
      callExpr('array_is_list', [refArg(subject)]),
    ]);
    return isNonEmptyKeyword(keyword)
      ? andExpr([
          listOk,
          binExpr('!==', refArg(subject), literalArg('[]')),
        ])
      : listOk;
  }
  return null;
}

function isArrayCollectionKeyword(keyword: string): boolean {
  return keyword === 'array' || keyword === 'non-empty-array';
}

function phpKeyLiteral(key: string | number): string {
  if (typeof key === 'number') {
    return String(key);
  }
  return `'${key.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

function phpLiteralFromNode(
  node: Extract<TypeNode, { kind: 'literal' }>,
): string | null {
  if (node.type === 'number') {
    return node.value;
  }
  const quote = node.quotes === 'double' ? '"' : "'";
  const escaped = node.value
    .replace(/\\/g, '\\\\')
    .replace(quote, `\\${quote}`);
  return `${quote}${escaped}${quote}`;
}

function exprAtoms(expr: Expr): Expr[] {
  if (expr.kind === 'and') {
    return expr.exprs;
  }
  return [expr];
}

function stripTrailingTrueReturn(body: Block): Block {
  return body.filter(
    (s) => !(s.kind === 'return' && s.expr.kind === 'bool' && s.expr.value),
  );
}

function keywordToBoolean(keyword: string, subject: ValueRef): Expr | null {
  const s = refArg(subject);

  switch (keyword) {
    case 'int':
    case 'integer':
      return callExpr('is_int', [s]);
    case 'string':
      return callExpr('is_string', [s]);
    case 'float':
    case 'double':
      return callExpr('is_float', [s]);
    case 'number':
    case 'numeric':
      return orExpr([callExpr('is_int', [s]), callExpr('is_float', [s])]);
    case 'bool':
    case 'boolean':
      return callExpr('is_bool', [s]);
    case 'scalar':
      return callExpr('is_scalar', [s]);
    case 'null':
      return binExpr('===', s, literalArg('null'));
    case 'array':
      return callExpr('is_array', [s]);
    case 'iterable':
      return callExpr('is_iterable', [s]);
    case 'object':
      return callExpr('is_object', [s]);
    case 'resource':
      return callExpr('is_resource', [s]);
    case 'mixed':
      return null;
    case 'never':
    case 'noreturn':
      return boolLit(false);
    case 'true':
      return binExpr('===', s, literalArg('true'));
    case 'false':
      return binExpr('===', s, literalArg('false'));
    case 'callable':
      return callExpr('is_callable', [s]);
    case 'array-key':
      return orExpr([callExpr('is_string', [s]), callExpr('is_int', [s])]);
    case 'positive-int':
      return andExpr([
        callExpr('is_int', [s]),
        binExpr('>', s, literalArg('0')),
      ]);
    case 'negative-int':
      return andExpr([
        callExpr('is_int', [s]),
        binExpr('<', s, literalArg('0')),
      ]);
    case 'non-positive-int':
      return andExpr([
        callExpr('is_int', [s]),
        binExpr('<=', s, literalArg('0')),
      ]);
    case 'non-negative-int':
      return andExpr([
        callExpr('is_int', [s]),
        binExpr('>=', s, literalArg('0')),
      ]);
    case 'non-zero-int':
      return andExpr([
        callExpr('is_int', [s]),
        binExpr('!==', s, literalArg('0')),
      ]);
    case 'non-empty-string':
      return andExpr([
        callExpr('is_string', [s]),
        binExpr('!==', s, literalArg("''")),
      ]);
    case 'non-falsy-string':
    case 'truthy-string':
      return andExpr([
        callExpr('is_string', [s]),
        binExpr('!==', s, literalArg("''")),
        binExpr('!==', s, literalArg("'0'")),
      ]);
    case 'non-empty-mixed':
      return andExpr([
        binExpr('!==', s, literalArg('false')),
        binExpr('!==', s, literalArg('0')),
        binExpr('!==', s, literalArg('0.0')),
        binExpr('!==', s, literalArg("''")),
        binExpr('!==', s, literalArg("'0'")),
        binExpr('!==', s, literalArg('[]')),
        binExpr('!==', s, literalArg('null')),
      ]);
    case 'empty':
      return orExpr([
        binExpr('===', s, literalArg('false')),
        binExpr('===', s, literalArg('0')),
        binExpr('===', s, literalArg('0.0')),
        binExpr('===', s, literalArg("''")),
        binExpr('===', s, literalArg("'0'")),
        binExpr('===', s, literalArg('[]')),
        binExpr('===', s, literalArg('null')),
      ]);
    case 'class-string':
    case 'interface-string':
    case 'trait-string':
      return andExpr([
        callExpr('is_string', [s]),
        callExpr('class_exists', [s]),
      ]);
    case 'enum-string':
      return andExpr([
        callExpr('is_string', [s]),
        callExpr('enum_exists', [s]),
      ]);
    case 'numeric-string':
      return andExpr([
        callExpr('is_string', [s]),
        callExpr('is_numeric', [s]),
      ]);
    case 'callable-string':
      return andExpr([
        callExpr('is_string', [s]),
        callExpr('is_callable', [s]),
      ]);
    case 'lowercase-string':
      return andExpr([
        callExpr('is_string', [s]),
        binExpr('===', callArg('strtolower', [s]), s),
      ]);
    case 'uppercase-string':
      return andExpr([
        callExpr('is_string', [s]),
        binExpr('===', callArg('strtoupper', [s]), s),
      ]);
    case 'decimal-int-string':
      return andExpr([
        callExpr('is_string', [s]),
        binExpr(
          '===',
          callArg('preg_match', [literalArg("'/^-?(?:0|[1-9]\\\\d*)$/'"), s]),
          literalArg('1'),
        ),
      ]);
    case 'non-decimal-int-string':
      return andExpr([
        callExpr('is_string', [s]),
        binExpr(
          '!==',
          callArg('preg_match', [literalArg("'/^-?(?:0|[1-9]\\\\d*)$/'"), s]),
          literalArg('1'),
        ),
      ]);
    case 'non-empty-lowercase-string':
      return andExpr([
        callExpr('is_string', [s]),
        binExpr('!==', s, literalArg("''")),
        binExpr('===', callArg('strtolower', [s]), s),
      ]);
    case 'non-empty-uppercase-string':
      return andExpr([
        callExpr('is_string', [s]),
        binExpr('!==', s, literalArg("''")),
        binExpr('===', callArg('strtoupper', [s]), s),
      ]);
    default:
      return null;
  }
  throw new Error('never reached');
}
