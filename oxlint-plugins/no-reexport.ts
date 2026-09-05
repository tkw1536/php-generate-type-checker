/** Oxlint JS plugin: forbid `export … from` / `export * from` re-exports. */

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
      description: 'Disallow re-exporting (`export … from`).',
    },
    schema: [],
    messages: {
      noReexport: 'Re-exporting is forbidden.',
    },
  },
  create(context: ReexportContext) {
    return {
      ExportAllDeclaration(node: ReexportNode) {
        context.report({ node, messageId: 'noReexport' });
      },
      'ExportNamedDeclaration[source]'(node: ReexportNode) {
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
