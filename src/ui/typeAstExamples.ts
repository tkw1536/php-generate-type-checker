import { exampleExpressions } from '../examples/pack.ts';
import { highlightCode } from '../highlight.ts';
import type { ParsedCheckerEntry } from '../parser/parseInput.ts';

function bindExampleCopyButton(
  button: HTMLButtonElement,
  expr: string,
): void {
  let timeoutId: number | undefined;
  button.addEventListener('click', () => {
    void (async () => {
      await navigator.clipboard.writeText(expr);
      button.textContent = 'Copied!';
      button.classList.add('copied');
      if (timeoutId !== undefined) {
        window.clearTimeout(timeoutId);
      }
      timeoutId = window.setTimeout(() => {
        timeoutId = undefined;
        button.textContent = 'Copy';
        button.classList.remove('copied');
      }, 1500);
    })();
  });
}

function renderExampleRow(expr: string): HTMLElement {
  const item = document.createElement('li');
  item.className = 'type-ast-examples-row';

  const pre = document.createElement('pre');
  pre.className = 'type-ast-examples-pre';
  const code = document.createElement('code');
  code.className = 'hljs language-php type-ast-examples-expr';
  code.innerHTML = highlightCode(expr, 'php');
  pre.append(code);

  const copyBtn = document.createElement('button');
  copyBtn.type = 'button';
  copyBtn.className = 'btn btn-quiet type-ast-examples-copy';
  copyBtn.setAttribute('aria-label', `Copy example ${expr}`);
  copyBtn.textContent = 'Copy';
  bindExampleCopyButton(copyBtn, expr);

  item.append(pre, copyBtn);
  return item;
}

/** Highlighted example expressions with a Copy button per row. */
export function renderExamplesDetail(entry: ParsedCheckerEntry): {
  readonly el: HTMLElement;
  readonly copyText: string;
} {
  const exprs = exampleExpressions(entry.ast);
  const body = document.createElement('div');
  body.className = 'type-ast-examples';
  body.id = 'type-output';
  body.setAttribute('aria-label', 'Type examples');
  if (exprs.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'type-ast-examples-empty';
    empty.textContent = 'No examples';
    body.append(empty);
    return { el: body, copyText: '' };
  }
  const list = document.createElement('ul');
  list.className = 'type-ast-examples-list';
  for (const expr of exprs) {
    list.append(renderExampleRow(expr));
  }
  body.append(list);
  return { el: body, copyText: `${exprs.join('\n')}\n` };
}
