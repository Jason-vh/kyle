/** Message text for a value thrown from anywhere, not just an Error. */
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Body for a failed request. Kyle is behind auth and used by a household, so
 * the real message is worth far more than a tidy one: it turns a report of
 * "it's broken" into something diagnosable without reading the server logs.
 */
export function errorResponse(error: unknown, status: number, context?: string): Response {
  const message = errorMessage(error);
  return Response.json({ error: context ? `${context}: ${message}` : message }, { status });
}

/** Log fields describing a thrown value, including a stack when there is one. */
export function errorFields(error: unknown): { error: string; stack?: string } {
  return {
    error: errorMessage(error),
    stack: error instanceof Error ? error.stack : undefined,
  };
}
