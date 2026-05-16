export const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/;

export function parseFrontmatter(text: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }
    const colon = trimmed.indexOf(':');
    if (colon === -1) {
      continue;
    }
    const key = trimmed.slice(0, colon).trim();
    let value = trimmed.slice(colon + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    result[key] = value;
  }
  return result;
}

export function trimBlankLines(text: string): string {
  const lines = text.split('\n');
  let start = 0;
  let end = lines.length;
  while (start < end && lines[start]?.trim() === '') {
    start++;
  }
  while (end > start && lines[end - 1]?.trim() === '') {
    end--;
  }
  return lines.slice(start, end).join('\n');
}

export function stripLeadingMarker(body: string, marker: string): string {
  const lines = body.split('\n');
  if (lines[0]?.trim().toLowerCase() === marker.toLowerCase()) {
    return lines.slice(1).join('\n');
  }
  return body;
}

export function splitFixture(content: string, name: string): { meta: Record<string, string>; body: string } {
  const match = content.match(FRONTMATTER_RE);
  if (!match) {
    throw new Error(`Fixture "${name}" must start with YAML frontmatter delimited by ---`);
  }
  return { meta: parseFrontmatter(match[1]), body: match[2] };
}
