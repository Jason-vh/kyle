import type { KnownBlock } from "@slack/web-api";
import type { ResultTable } from "../agent/result-tables.ts";

/** Render tables as captioned Block Kit tables appended to the reply. */
export function tableBlocks(tables: ResultTable[]): KnownBlock[] {
  return tables.flatMap((table): KnownBlock[] => [
    { type: "markdown", text: `**${table.caption}**` },
    {
      type: "table",
      rows: [table.headers, ...table.rows].map((row) =>
        row.map((cell) => ({ type: "raw_text" as const, text: cell || "—" })),
      ),
    },
  ]);
}
