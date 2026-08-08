import { Type } from "@sinclair/typebox";
import type { Tool } from "../agent/tool.ts";
import { jsonResult } from "../agent/tool-result.ts";
import * as brave from "./api.ts";
import { toPartialWebResult } from "./utils.ts";

const webSearchParams = Type.Object({
  query: Type.String({
    description: "The search query to look up on the web",
  }),
  count: Type.Optional(
    Type.Number({
      description: "Number of results to return (default 5, max 20)",
      default: 5,
    }),
  ),
});

export const webSearchTool: Tool<typeof webSearchParams> = {
  name: "web_search",
  description:
    "Search the web for information — release dates, cast info, reviews, general knowledge, or anything else online",
  parameters: webSearchParams,
  label: "Searching the web",
  summary: (args) => `Searched the web for '${args.query}'`,
  async execute(_toolCallId, params) {
    const count = params.count ?? 5;
    const response = await brave.searchWeb(params.query, { count });
    const results = (response.web?.results ?? []).map(toPartialWebResult);
    return jsonResult(results);
  },
};

export const braveTools = [webSearchTool];
