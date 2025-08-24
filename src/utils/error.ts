export class RespSerializeError extends Error {
  constructor(message: string, value?: unknown) {
    super(`${message}${value !== undefined ? `: ${JSON.stringify(value)}` : ''}`);
    this.name = 'RespSerializeError';
  }
}
