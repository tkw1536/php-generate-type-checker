export function wrapChecker(typeString: string, body: string): string {
  const escapedType = typeString.trim();
  return `/**
 * @param mixed $data
 * @phpstan-assert-if-true ${escapedType} $data
 */
public static function checkType(mixed $data): bool
{
${body}
}
`;
}

export function generateCheckerFromAst(typeString: string, body: string): string {
  return wrapChecker(typeString, body);
}
