export class GenerationError extends Error {
  readonly typeDescription?: string;
  readonly expressionIndex?: number;
  readonly segmentSource?: string;

  constructor(
    message: string,
    typeDescription?: string,
    options?: { expressionIndex?: number; segmentSource?: string },
  ) {
    super(message);
    this.name = 'GenerationError';
    this.typeDescription = typeDescription;
    this.expressionIndex = options?.expressionIndex;
    this.segmentSource = options?.segmentSource;
  }
}
