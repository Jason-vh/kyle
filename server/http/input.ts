export function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function isInteger(value: unknown, minimum = 0): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= minimum &&
    value <= 2_147_483_647
  );
}

export function isUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
  );
}

export function isText(value: unknown, maximum = 10_000): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= maximum;
}

export async function readJsonObject(
  req: Request,
  allowEmpty = false,
): Promise<Record<string, unknown>> {
  const text = await req.text();
  if (allowEmpty && text.trim() === "") return {};
  const body: unknown = JSON.parse(text);
  if (!isObject(body)) throw new Error("Expected a JSON object");
  return body;
}
