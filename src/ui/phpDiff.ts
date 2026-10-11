export type PhpDiffLineKind = 'ctx' | 'add' | 'del';

export type PhpDiffLine = {
  readonly kind: PhpDiffLineKind;
  readonly text: string;
};

export type PhpDiffHunk = {
  readonly oldStart: number;
  readonly oldCount: number;
  readonly newStart: number;
  readonly newCount: number;
  readonly lines: readonly PhpDiffLine[];
};

export type PhpDiffResult = {
  readonly hunks: readonly PhpDiffHunk[];
  readonly unified: string;
};

type Op = { readonly tag: 'eq' | 'del' | 'add'; readonly line: string };

const CONTEXT = 3;

/** Split PHP text into lines, preserving a trailing empty line only if present. */
function splitLines(text: string): string[] {
  if (text === '') {
    return [];
  }
  return text.split('\n');
}

/** LCS-based line ops (Myers-style via DP table). */
function diffOps(a: readonly string[], b: readonly string[]): Op[] {
  const n = a.length;
  const m = b.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () =>
    Array.from({ length: m + 1 }, () => 0),
  );
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] =
        a[i] === b[j]
          ? dp[i + 1][j + 1] + 1
          : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const ops: Op[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      ops.push({ tag: 'eq', line: a[i] });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      ops.push({ tag: 'del', line: a[i] });
      i++;
    } else {
      ops.push({ tag: 'add', line: b[j] });
      j++;
    }
  }
  while (i < n) {
    ops.push({ tag: 'del', line: a[i] });
    i++;
  }
  while (j < m) {
    ops.push({ tag: 'add', line: b[j] });
    j++;
  }
  return ops;
}

type ChangeSpan = { readonly start: number; readonly end: number };

function changeSpans(ops: readonly Op[]): ChangeSpan[] {
  const spans: ChangeSpan[] = [];
  let i = 0;
  while (i < ops.length) {
    if (ops[i].tag === 'eq') {
      i++;
      continue;
    }
    const start = i;
    while (i < ops.length && ops[i].tag !== 'eq') {
      i++;
    }
    spans.push({ start, end: i });
  }
  return spans;
}

function mergeWindows(
  spans: readonly ChangeSpan[],
  opCount: number,
): { readonly lo: number; readonly hi: number }[] {
  if (spans.length === 0) {
    return [];
  }
  const windows = spans.map((s) => ({
    lo: Math.max(0, s.start - CONTEXT),
    hi: Math.min(opCount, s.end + CONTEXT),
  }));
  const merged: { lo: number; hi: number }[] = [windows[0]];
  for (let i = 1; i < windows.length; i++) {
    const prev = merged.at(-1)!;
    const cur = windows[i];
    if (cur.lo <= prev.hi) {
      prev.hi = Math.max(prev.hi, cur.hi);
    } else {
      merged.push({ ...cur });
    }
  }
  return merged;
}

function buildHunk(
  ops: readonly Op[],
  lo: number,
  hi: number,
): PhpDiffHunk {
  let oldStart = 1;
  let newStart = 1;
  for (let i = 0; i < lo; i++) {
    const op = ops[i];
    if (op.tag === 'eq' || op.tag === 'del') {
      oldStart++;
    }
    if (op.tag === 'eq' || op.tag === 'add') {
      newStart++;
    }
  }
  const lines: PhpDiffLine[] = [];
  let oldCount = 0;
  let newCount = 0;
  for (let i = lo; i < hi; i++) {
    const op = ops[i];
    switch (op.tag) {
      case 'eq':
        lines.push({ kind: 'ctx', text: op.line });
        oldCount++;
        newCount++;
        break;
      case 'del':
        lines.push({ kind: 'del', text: op.line });
        oldCount++;
        break;
      case 'add':
        lines.push({ kind: 'add', text: op.line });
        newCount++;
        break;
      default:
        throw new Error('never reached');
    }
  }
  return { oldStart, oldCount, newStart, newCount, lines };
}

function formatUnified(hunks: readonly PhpDiffHunk[]): string {
  if (hunks.length === 0) {
    return '';
  }
  const parts: string[] = ['--- before', '+++ after'];
  for (const hunk of hunks) {
    parts.push(
      `@@ -${hunk.oldStart},${hunk.oldCount} +${hunk.newStart},${hunk.newCount} @@`,
    );
    for (const line of hunk.lines) {
      const prefix =
        line.kind === 'ctx' ? ' ' : line.kind === 'add' ? '+' : '-';
      parts.push(`${prefix}${line.text}`);
    }
  }
  return parts.join('\n');
}

/**
 * Unified line diff of two PHP strings with {@link CONTEXT} lines of context.
 * No external dependencies.
 */
export function phpDiff(before: string, after: string): PhpDiffResult {
  const a = splitLines(before);
  const b = splitLines(after);
  const ops = diffOps(a, b);
  const spans = changeSpans(ops);
  if (spans.length === 0) {
    return { hunks: [], unified: '' };
  }
  const windows = mergeWindows(spans, ops.length);
  const hunks = windows.map((w) => buildHunk(ops, w.lo, w.hi));
  return { hunks, unified: formatUnified(hunks) };
}
