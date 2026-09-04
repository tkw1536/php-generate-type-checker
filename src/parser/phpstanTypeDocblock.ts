export type PhpstanTypeDef = {
  readonly name: string;
  readonly typeString: string;
  readonly start: number;
  readonly end: number;
};

export type PhpstanTypeAlias = Pick<PhpstanTypeDef, 'name' | 'typeString'>;

export class PhpstanTypeExtractError extends Error {
  readonly pos: number;

  constructor(message: string, pos: number) {
    super(message);
    this.name = 'PhpstanTypeExtractError';
    this.pos = pos;
  }
}

const ALIAS_NAME_PATTERN = /^[A-Za-z_\\][A-Za-z0-9_\\]*$/u;
const DOC_TAG_LINE_PATTERN = /^\s*(?:\*+\s*)?@([A-Za-z][\w-]*)\b/u;

export function isDocblockInput(input: string): boolean {
  return input.trimStart().startsWith('/*');
}

export function extractPhpstanTypes(source: string): PhpstanTypeDef[] {
  const trimmed = source.trimStart();
  if (!trimmed.startsWith('/*')) {
    throw new PhpstanTypeExtractError(
      'Expected docblock input starting with /*',
      0,
    );
  }

  const startOffset = source.length - source.trimStart().length;
  const lines = splitDocblockLines(source.slice(startOffset));
  const defs: PhpstanTypeDef[] = [];
  const seenNames = new Set<string>();

  let i = 0;
  while (i < lines.length) {
    const parsed = tryParsePhpstanTypeAt(lines, i, seenNames);
    if (parsed === null) {
      i++;
      continue;
    }
    defs.push(parsed.def);
    i = parsed.nextIndex;
  }

  if (defs.length === 0) {
    throw new PhpstanTypeExtractError(
      'No @phpstan-type definitions found in docblock',
      startOffset,
    );
  }

  return defs;
}

function tryParsePhpstanTypeAt(
  lines: readonly DocLine[],
  index: number,
  seenNames: Set<string>,
): { def: PhpstanTypeDef; nextIndex: number } | null {
  const line = lines[index];
  const tagMatch = line.content.match(
    /^\s*(?:\*+\s*)?@phpstan-type(?:\s+(.*))?$/u,
  );
  if (!tagMatch) {
    return null;
  }

  const nameAndRest = parsePhpstanTypeName(tagMatch[1]?.trim() ?? '', line.start);
  if (seenNames.has(nameAndRest.name)) {
    throw new PhpstanTypeExtractError(
      `Duplicate @phpstan-type alias "${nameAndRest.name}"`,
      line.start,
    );
  }
  seenNames.add(nameAndRest.name);

  const { typeString, nextIndex } = collectPhpstanTypeBody(
    lines,
    index,
    nameAndRest.initialType,
    line.start,
  );

  return {
    def: {
      name: nameAndRest.name,
      typeString,
      start: line.start,
      end: nextIndex > 0 ? lines[nextIndex - 1].end : line.end,
    },
    nextIndex,
  };
}

function parsePhpstanTypeName(
  restRaw: string,
  pos: number,
): { name: string; initialType: string } {
  let rest = restRaw.replace(/\*+\/\s*$/u, '').trim();
  if (rest === '') {
    throw new PhpstanTypeExtractError(
      'Expected alias name after @phpstan-type',
      pos,
    );
  }
  const nameMatch = rest.match(/^([A-Za-z_\\][A-Za-z0-9_\\]*)(?:\s+(.*))?$/su);
  if (!nameMatch) {
    throw new PhpstanTypeExtractError(
      `Invalid alias name in @phpstan-type: ${rest}`,
      pos,
    );
  }
  const name = nameMatch[1];
  if (!ALIAS_NAME_PATTERN.test(name)) {
    throw new PhpstanTypeExtractError(`Invalid alias name "${name}"`, pos);
  }
  return { name, initialType: nameMatch[2]?.trim() ?? '' };
}

function collectPhpstanTypeBody(
  lines: readonly DocLine[],
  index: number,
  initialType: string,
  defStart: number,
): { typeString: string; nextIndex: number } {
  const typeParts: string[] = [];
  if (initialType !== '') {
    typeParts.push(initialType);
  }
  let i = index + 1;
  while (i < lines.length) {
    const next = lines[i];
    if (DOC_TAG_LINE_PATTERN.test(next.content)) {
      break;
    }
    const continuation = stripDocLinePrefix(next.content);
    if (continuation.trim() !== '') {
      typeParts.push(continuation.trim());
    }
    i++;
  }
  const typeString = normalizeTypeString(typeParts.join(' '));
  if (typeString === '') {
    throw new PhpstanTypeExtractError(
      'Missing type definition for @phpstan-type',
      defStart,
    );
  }
  return { typeString, nextIndex: i };
}

type DocLine = {
  readonly content: string;
  readonly start: number;
  readonly end: number;
};

function splitDocblockLines(source: string): DocLine[] {
  const lines: DocLine[] = [];
  let offset = 0;
  const rawLines = source.split('\n');

  for (let lineIndex = 0; lineIndex < rawLines.length; lineIndex++) {
    const raw = rawLines[lineIndex];
    const lineStart = offset;
    let content = raw;

    if (lineIndex === 0) {
      content = content.replace(/^\/\*+\s?/u, '');
    }
    if (lineIndex === rawLines.length - 1) {
      content = content.replace(/\*+\/\s*$/u, '');
    }

    lines.push({
      content,
      start: lineStart,
      end: lineStart + raw.length,
    });
    offset += raw.length + 1;
  }

  return lines;
}

function stripDocLinePrefix(line: string): string {
  return line.replace(/^\s*\*+\s?/u, '');
}

function normalizeTypeString(typeString: string): string {
  return typeString.replaceAll(/\s+/gu, ' ').trim();
}

/** PHPDoc block of `@phpstan-type` lines for prepending to generated PHP. */
export function formatPhpstanTypeAliasesBlock(
  aliases: readonly PhpstanTypeAlias[],
): string {
  if (aliases.length === 0) {
    return '';
  }
  const lines = aliases.map(
    (alias) => ` * @phpstan-type ${alias.name} ${alias.typeString}`,
  );
  return `/**\n${lines.join('\n')}\n */\n\n`;
}
