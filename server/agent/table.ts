/** Tabular data pulled out of a tool result, ready to render however a client likes. */
export interface ResultTable {
  caption: string;
  headers: string[];
  rows: string[][];
}

/** Keeps messages readable; Kyle's prose covers anything past this. */
const MAX_ROWS = 10;

/**
 * Builds a capped table, or nothing when there is no data.
 *
 * Queue and calendar results are inherently tabular and read poorly as prose, so
 * the tools that produce them render a real table instead.
 */
export function buildTable<T>(
  caption: string,
  headers: string[],
  items: T[],
  toRow: (item: T) => string[],
): ResultTable | undefined {
  if (items.length === 0) return undefined;
  return {
    caption: items.length > MAX_ROWS ? `${caption} (${MAX_ROWS} of ${items.length})` : caption,
    headers,
    rows: items.slice(0, MAX_ROWS).map(toRow),
  };
}
