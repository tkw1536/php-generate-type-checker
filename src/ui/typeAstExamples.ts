import {
  counterexampleExpressions,
  exampleExpressions,
} from '../examples/pack.ts';
import { highlightCode } from '../highlight.ts';
import type { TypeNode } from '../parser/ast.ts';

const EXAMPLES_HELP =
  'PHP values that should satisfy this type.';
const COUNTEREXAMPLES_HELP =
  'PHP values that should not satisfy this type.';

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

function renderExampleRow(
  expr: string,
  kind: 'example' | 'counterexample',
): HTMLElement {
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
  copyBtn.setAttribute(
    'aria-label',
    `Copy ${kind} ${expr}`,
  );
  copyBtn.textContent = 'Copy';
  bindExampleCopyButton(copyBtn, expr);

  item.append(pre, copyBtn);
  return item;
}

function renderHelpControl(
  helpId: string,
  label: string,
  help: string,
): DocumentFragment {
  const fragment = document.createDocumentFragment();
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'option-help type-ast-examples-help';
  button.setAttribute('aria-label', `Help: ${label}`);
  button.setAttribute('aria-describedby', helpId);
  button.dataset.tooltip = help;
  button.textContent = '?';
  const hidden = document.createElement('span');
  hidden.id = helpId;
  hidden.className = 'visually-hidden';
  hidden.textContent = help;
  fragment.append(button, hidden);
  return fragment;
}

function renderGroup(
  title: string,
  helpId: string,
  help: string,
  exprs: readonly string[],
  kind: 'example' | 'counterexample',
): HTMLElement {
  const section = document.createElement('section');
  section.className = 'type-ast-examples-group';
  section.setAttribute('aria-label', title);

  const heading = document.createElement('h3');
  heading.className = 'type-ast-examples-heading';
  const titleText = document.createElement('span');
  titleText.textContent = title;
  heading.append(titleText, renderHelpControl(helpId, title, help));

  const list = document.createElement('ul');
  list.className = 'type-ast-examples-list';
  for (const expr of exprs) {
    list.append(renderExampleRow(expr, kind));
  }
  section.append(heading, list);
  return section;
}

/** Highlighted example / counterexample expressions with Copy per row. */
export function renderExamplesDetail(ast: TypeNode): {
  readonly el: HTMLElement;
  readonly copyText: string;
} {
  const examples = exampleExpressions(ast);
  const counterexamples = counterexampleExpressions(ast);
  const body = document.createElement('div');
  body.className = 'type-ast-examples';
  body.id = 'type-output';
  body.setAttribute('aria-label', 'Type examples');

  const copyParts: string[] = [];
  if (examples.length > 0) {
    body.append(
      renderGroup(
        'Examples',
        'type-ast-examples-help',
        EXAMPLES_HELP,
        examples,
        'example',
      ),
    );
    copyParts.push(...examples);
  }
  if (counterexamples.length > 0) {
    body.append(
      renderGroup(
        'Counterexamples',
        'type-ast-counterexamples-help',
        COUNTEREXAMPLES_HELP,
        counterexamples,
        'counterexample',
      ),
    );
    copyParts.push(...counterexamples);
  }
  return {
    el: body,
    copyText: copyParts.length > 0 ? `${copyParts.join('\n')}\n` : '',
  };
}

/** True when the Examples leaf should be shown for this type AST. */
export function astHasExampleValues(ast: TypeNode): boolean {
  return (
    exampleExpressions(ast).length > 0 ||
    counterexampleExpressions(ast).length > 0
  );
}
