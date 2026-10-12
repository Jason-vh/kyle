export class ApiOverloadedError extends Error {
  constructor(message = "API is overloaded after retries") {
    super(message);
    this.name = "ApiOverloadedError";
  }
}

export function isOverloadedError(error?: string): boolean {
  if (!error) return false;
  const lower = error.toLowerCase();
  return lower.includes("overloaded") || lower.includes("529");
}
