export class GenerationError extends Error {
  readonly typeDescription?: string;
  readonly expressionIndex?: number;
  readonly segmentSource?: string;
  readonly cause?: Error;

  constructor(
    message: string,
    typeDescription?: string,
    options?: {
      readonly expressionIndex?: number;
      readonly segmentSource?: string;
    },
    cause?: Error,
  ) {
    super(message);
    this.name = 'GenerationError';
    this.typeDescription = typeDescription;
    this.expressionIndex = options?.expressionIndex;
    this.segmentSource = options?.segmentSource;
    this.cause = cause;
  }
}
