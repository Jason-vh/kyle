/** Message text for a value thrown from anywhere, not just an Error. */
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Log fields describing a thrown value, including a stack when there is one. */
export function errorFields(error: unknown): { error: string; stack?: string } {
  return {
    error: errorMessage(error),
    stack: error instanceof Error ? error.stack : undefined,
  };
}
