import { Type } from "@sinclair/typebox";
import type { Tool } from "./tool.ts";
import { jsonResult } from "./tool-result.ts";
import { buildTable, type ResultTable } from "./table.ts";
import { getSubscriptionsForUser } from "#server/db/subscriptions.ts";
import { getMediaRequestsForUser } from "#server/db/requests.ts";
import { withState } from "#server/requests/state.ts";
import { appOrigin } from "#server/config.ts";
import type { MediaRequest } from "#shared/types.ts";

const params = Type.Object({
  userId: Type.String({
    description: "The app user ID (UUID) to look up subscriptions for",
  }),
});

export const getRequestsForUserTool: Tool<typeof params> = {
  name: "get_requests_for_user",
  description:
    "Get all media subscriptions for a specific user. Returns movies and series the user has requested, with their notification subscription status (active/inactive). The userId parameter is the app user UUID shown in conversation context.",
  parameters: params,
  label: "Looking up user subscriptions",
  summary: "Looked up user subscriptions",
  async execute(_toolCallId, params) {
    const subscriptions = await getSubscriptionsForUser(params.userId);
    return jsonResult(subscriptions);
  },
};

/** The same state the web app shows, plus somewhere to send the person. */
function toRequestState(request: MediaRequest) {
  return {
    title: request.title,
    year: request.year ?? undefined,
    mediaType: request.mediaType,
    state: request.state,
    detail: request.detail,
    expectedAt: request.expectedAt,
    since: request.since,
    missing: request.missing,
    progress: request.progress,
    eta: request.eta,
    link: `${appOrigin()}/media/${request.mediaType}/${request.tmdbId}`,
  };
}

type RequestStateRow = ReturnType<typeof toRequestState>;

function requestStatesTable(payload: unknown): ResultTable | undefined {
  if (!Array.isArray(payload)) return undefined;

  return buildTable<RequestStateRow>(
    "Requests",
    ["Title", "State", "Detail"],
    payload as RequestStateRow[],
    (row) => [
      row.year ? `${row.title} (${row.year})` : row.title,
      row.state,
      row.detail ?? row.expectedAt ?? "\u2014",
    ],
  );
}

export const getRequestStatesTool: Tool<typeof params> = {
  name: "get_request_states",
  description: [
    "Where every title a user asked for has got to, as the web app reports it.",
    "Use this to answer 'where is my X' rather than piecing the queue and library together by hand.",
    "Each request carries one state:",
    "unreleased (not out anywhere yet, expectedAt says when),",
    "waiting (out, but not in a form we can fetch yet),",
    "searching (nothing found yet; since is the last search),",
    "found (a release is in hand, held by a delay),",
    "downloading (progress and eta),",
    "stalled (downloading but going nowhere — offer to search for another release),",
    "blocked (downloaded and the import failed — this needs a person, investigate it),",
    "importing (downloaded and being imported; Plex has yet to see it),",
    "ready (watchable on Plex; missing lists seasons a series is still short of),",
    "paused (nothing on disk and nobody monitoring — nothing will happen until it is monitored),",
    "removed (no longer in the library).",
  ].join(" "),
  parameters: params,
  label: "Checking where requests have got to",
  summary: "Checked where requests have got to",
  table: requestStatesTable,
  async execute(_toolCallId, params) {
    const requests = await withState(await getMediaRequestsForUser(params.userId));
    return jsonResult(requests.map(toRequestState));
  },
};
