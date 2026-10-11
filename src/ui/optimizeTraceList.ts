import { optimizeTraceRuleInfo } from '../generator/optimizer/trace/rules.ts';
import type { OptimizeTraceEvent } from '../generator/optimizer/trace/types.ts';

export function listLabel(event: OptimizeTraceEvent): string {
  return optimizeTraceRuleInfo(event.rule).title;
}

export function programGroupLabel(program: string): string {
  return program === '(prune)' ? 'Prune' : program;
}

/** Group events by checker program, preserving first-seen group order. */
export function groupEventsByProgram(
  events: readonly OptimizeTraceEvent[],
): readonly {
  readonly program: string;
  readonly events: readonly OptimizeTraceEvent[];
}[] {
  const order: string[] = [];
  const map = new Map<string, OptimizeTraceEvent[]>();
  for (const event of events) {
    const existing = map.get(event.program);
    if (existing === undefined) {
      order.push(event.program);
      map.set(event.program, [event]);
    } else {
      existing.push(event);
    }
  }
  return order.map((program) => ({
    program,
    events: map.get(program)!,
  }));
}

export function renderEventList(
  events: readonly OptimizeTraceEvent[],
  selectedIndex: number,
  onSelect: (index: number) => void,
): HTMLElement {
  const root = document.createElement('div');
  root.className = 'optimize-trace-list';
  root.setAttribute('role', 'listbox');
  root.setAttribute('aria-label', 'Optimize rewrite applications');

  for (const group of groupEventsByProgram(events)) {
    const heading = document.createElement('div');
    heading.className = 'optimize-trace-group';
    heading.textContent = programGroupLabel(group.program);
    root.append(heading);

    for (const event of group.events) {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'optimize-trace-item';
      item.setAttribute('role', 'option');
      item.dataset.index = String(event.index);
      const active = event.index === selectedIndex;
      item.classList.toggle('active', active);
      item.setAttribute('aria-selected', active ? 'true' : 'false');
      item.tabIndex = active ? 0 : -1;
      item.textContent = listLabel(event);
      item.addEventListener('click', () => {
        onSelect(event.index);
      });
      root.append(item);
    }
  }
  return root;
}
