/** Reads an optional env var at call time, treating blank as unset. */
export function optionalEnv(name: string): string | undefined {
  return process.env[name] || undefined;
}

/** Reads env vars at call time, failing with every missing name at once. */
export function requireEnv<const T extends readonly string[]>(
  ...names: T
): { [K in keyof T]: string } {
  const values = names.map((name) => process.env[name]);
  const missing = names.filter((_, i) => !values[i]);
  if (missing.length > 0) {
    throw new Error(
      `${missing.join(", ")} environment variable${missing.length > 1 ? "s are" : " is"} required`,
    );
  }
  return values as { [K in keyof T]: string };
}
