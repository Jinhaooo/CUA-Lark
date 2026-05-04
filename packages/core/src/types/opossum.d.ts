declare module 'opossum' {
  export default class CircuitBreaker<T extends (...args: unknown[]) => unknown = (...args: unknown[]) => unknown> {
    constructor(action: T, options?: Record<string, unknown>);
    state: string;
    fire(...args: Parameters<T>): Promise<Awaited<ReturnType<T>>>;
    reset(): void;
  }
}
