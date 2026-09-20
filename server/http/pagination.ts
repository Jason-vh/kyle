interface Page {
  records: { id: number }[];
  totalRecords: number;
}

export async function readAllPages<T extends Page>(load: (page: number) => Promise<T>): Promise<T> {
  let result: T | undefined;
  const seen = new Set<number>();
  for (let page = 1; page <= 100; page++) {
    const next = await load(page);
    if (
      !next ||
      !Array.isArray(next.records) ||
      !Number.isSafeInteger(next.totalRecords) ||
      next.totalRecords < 0
    ) {
      throw new Error("Invalid paginated response");
    }
    for (const record of next.records) {
      if (!Number.isSafeInteger(record?.id) || seen.has(record.id)) {
        throw new Error("Invalid or repeated paginated record");
      }
      seen.add(record.id);
    }
    if (!result) {
      result = { ...next, records: [...next.records] };
    } else {
      if (next.totalRecords !== result.totalRecords) {
        throw new Error("Paginated results changed while reading");
      }
      result.records.push(...next.records);
    }
    if (result.records.length === result.totalRecords) return result;
    if (next.records.length === 0 || result.records.length > result.totalRecords) {
      throw new Error("Incomplete paginated response");
    }
  }
  throw new Error("Paginated response exceeds the page limit");
}
