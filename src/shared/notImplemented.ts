/** Placeholder for Stage 3 contracts. Every call site is replaced during implementation. */
export function notImplemented(...args: unknown[]): never {
  throw new Error(`Not implemented (called with ${String(args.length)} args)`);
}
