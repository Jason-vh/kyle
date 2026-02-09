import { Type } from "@sinclair/typebox";
import type { AgentTool } from "@mariozechner/pi-agent-core";
import { getAllSeries } from "./api.ts";

const parameters = Type.Object({});

export const getAllSeriesTool: AgentTool<typeof parameters> = {
  name: "get_all_series",
  description: "Get all TV series currently in the Sonarr library",
  parameters,
  label: "Fetching series from Sonarr",
  async execute() {
    const series = await getAllSeries();
    const mapped = series.map((s) => ({
      id: s.id,
      title: s.title,
      year: s.year,
      status: s.status,
      overview: s.overview,
      monitored: s.monitored,
      seasonCount: s.seasons.length,
      tvdbId: s.tvdbId,
    }));
    return {
      content: [{ type: "text", text: JSON.stringify(mapped) }],
      details: undefined,
    };
  },
};
