export class GenerationError extends Error {
  readonly typeDescription?: string;

  constructor(message: string, typeDescription?: string) {
    super(message);
    this.name = 'GenerationError';
    this.typeDescription = typeDescription;
  }
}
