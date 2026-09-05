/** Oxlint JS plugin: forbid re-exports and `export { name }` away from the definition. */

type ReexportNode = {
  readonly type: string;
};

type ReexportContext = {
  report(descriptor: {
    readonly node: ReexportNode;
    readonly messageId: 'noReexport';
  }): void;
};

const noReexport = {
  meta: {
    type: 'problem' as const,
    docs: {
      description:
        'Disallow re-exports and `export { name }` not attached to a definition.',
    },
    schema: [],
    messages: {
      noReexport:
        'Export only at the definition site; `export { name }` / `export … from` is forbidden.',
    },
  },
  create(context: ReexportContext) {
    return {
      ExportAllDeclaration(node: ReexportNode) {
        context.report({ node, messageId: 'noReexport' });
      },
      // `export { a }`, `export { a } from '…'`, `export type { A }` — no inline declaration
      'ExportNamedDeclaration[declaration=null]'(node: ReexportNode) {
        context.report({ node, messageId: 'noReexport' });
      },
    };
  },
};

const plugin = {
  meta: {
    name: 'local',
  },
  rules: {
    'no-reexport': noReexport,
  },
};

export default plugin;
