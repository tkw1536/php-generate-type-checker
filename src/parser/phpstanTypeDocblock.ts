export type PhpstanTypeDef = {
  readonly name: string;
  readonly typeString: string;
  /** Absolute start of the type body in the original source (for parse error positions). */
  readonly typeStart: number;
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

/**
 * Extract `@phpstan-type` defs from a single block comment region.
 * Positions are absolute using {@link baseOffset}. May return an empty list.
 */
export function extractPhpstanTypesFromComment(
  commentSource: string,
  baseOffset: number,
  seenNames: Set<string>,
): PhpstanTypeDef[] {
  const lines = splitDocblockLines(commentSource, baseOffset);
  const defs: PhpstanTypeDef[] = [];

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

  const { rest, restStart } = phpstanTypeRest(line);
  const nameAndRest = parsePhpstanTypeName(rest, restStart);
  if (seenNames.has(nameAndRest.name)) {
    throw new PhpstanTypeExtractError(
      `Duplicate @phpstan-type alias "${nameAndRest.name}"`,
      findAliasNameStart(line, nameAndRest.name),
    );
  }
  seenNames.add(nameAndRest.name);

  const { typeString, typeStart, nextIndex } = collectPhpstanTypeBody(
    lines,
    index,
    nameAndRest.name,
    nameAndRest.initialType,
    line.start,
  );

  return {
    def: {
      name: nameAndRest.name,
      typeString,
      typeStart,
      start: line.start,
      end: nextIndex > 0 ? lines[nextIndex - 1].end : line.end,
    },
    nextIndex,
  };
}

function parsePhpstanTypeName(
  rest: string,
  restStart: number,
): { name: string; initialType: string } {
  if (rest === '') {
    throw new PhpstanTypeExtractError(
      'Expected alias name after @phpstan-type',
      restStart,
    );
  }
  const nameMatch = rest.match(/^([A-Za-z_\\][A-Za-z0-9_\\]*)(?:\s+(.*))?$/su);
  if (!nameMatch) {
    throw new PhpstanTypeExtractError(
      `Invalid alias name in @phpstan-type: ${rest}`,
      restStart,
    );
  }
  const name = nameMatch[1];
  if (!ALIAS_NAME_PATTERN.test(name)) {
    throw new PhpstanTypeExtractError(
      `Invalid alias name "${name}"`,
      restStart,
    );
  }
  return { name, initialType: nameMatch[2]?.trim() ?? '' };
}

/**
 * Text after `@phpstan-type` and its absolute start (first non-space of the name/type rest).
 */
function phpstanTypeRest(line: DocLine): { rest: string; restStart: number } {
  const tagAt = line.content.search(/@phpstan-type\b/u);
  if (tagAt < 0) {
    return { rest: '', restStart: line.contentStart };
  }
  const afterTagRel = tagAt + '@phpstan-type'.length;
  const afterTag = line.content.slice(afterTagRel);
  const wsLen = afterTag.match(/^\s*/u)?.[0].length ?? 0;
  const rest = afterTag
    .slice(wsLen)
    .replace(/\*+\/\s*$/u, '')
    .trimEnd();
  return {
    rest,
    restStart: line.contentStart + afterTagRel + wsLen,
  };
}

function collectPhpstanTypeBody(
  lines: readonly DocLine[],
  index: number,
  aliasName: string,
  initialType: string,
  defStart: number,
): { typeString: string; typeStart: number; nextIndex: number } {
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
  return {
    typeString,
    typeStart: findTypeBodyStart(lines, index, aliasName, initialType),
    nextIndex: i,
  };
}

/** Absolute offset of the first character of the alias name in the original source. */
function findAliasNameStart(line: DocLine, aliasName: string): number {
  const tagAt = line.content.search(/@phpstan-type\b/u);
  if (tagAt < 0) {
    return line.contentStart;
  }
  const afterTag = line.content.slice(tagAt + '@phpstan-type'.length);
  const wsLen = afterTag.match(/^\s*/u)?.[0].length ?? 0;
  if (afterTag.slice(wsLen).startsWith(aliasName)) {
    return line.contentStart + tagAt + '@phpstan-type'.length + wsLen;
  }
  return line.contentStart + tagAt;
}

/** Absolute offset of the first character of the type body in the original source. */
function findTypeBodyStart(
  lines: readonly DocLine[],
  index: number,
  aliasName: string,
  initialType: string,
): number {
  const line = lines[index];
  if (initialType !== '') {
    const needle = `@phpstan-type ${aliasName}`;
    const needleAt = line.content.indexOf(needle);
    if (needleAt >= 0) {
      let i = needleAt + needle.length;
      while (i < line.content.length && /\s/u.test(line.content[i])) {
        i++;
      }
      return line.contentStart + i;
    }
  }

  for (let i = index + 1; i < lines.length; i++) {
    const next = lines[i];
    if (DOC_TAG_LINE_PATTERN.test(next.content)) {
      break;
    }
    const stripped = stripDocLinePrefix(next.content);
    const lead = stripped.length - stripped.trimStart().length;
    if (stripped.trim() !== '') {
      const prefixLen = next.content.length - stripped.length;
      return next.contentStart + prefixLen + lead;
    }
  }

  return line.contentStart;
}

type DocLine = {
  readonly content: string;
  /** Absolute start of the raw source line. */
  readonly start: number;
  readonly end: number;
  /** Absolute start of {@link content} within the original source. */
  readonly contentStart: number;
};

function splitDocblockLines(source: string, baseOffset = 0): DocLine[] {
  const lines: DocLine[] = [];
  let offset = 0;
  const rawLines = source.split('\n');

  for (let lineIndex = 0; lineIndex < rawLines.length; lineIndex++) {
    const raw = rawLines[lineIndex];
    const lineStart = baseOffset + offset;
    let contentStart = lineStart;
    let content = raw;

    if (lineIndex === 0) {
      const prefix = raw.match(/^\/\*+\s?/u)?.[0] ?? '';
      contentStart = lineStart + prefix.length;
      content = raw.slice(prefix.length);
    }
    if (lineIndex === rawLines.length - 1) {
      content = content.replace(/\*+\/\s*$/u, '');
    }

    lines.push({
      content,
      start: lineStart,
      end: lineStart + raw.length,
      contentStart,
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
