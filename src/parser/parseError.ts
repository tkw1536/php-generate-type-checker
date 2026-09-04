export class ParseError extends Error {
  readonly pos: number;
  /** 0-based index of the type expression being parsed when {@link parseTypes} fails. */
  readonly expressionIndex?: number;

  constructor(message: string, pos: number, expressionIndex?: number) {
    super(message);
    this.name = 'ParseError';
    this.pos = pos;
    this.expressionIndex = expressionIndex;
  }
}
