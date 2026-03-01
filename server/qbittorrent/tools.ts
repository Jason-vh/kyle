import { Type } from "@sinclair/typebox";
import type { AgentTool } from "@mariozechner/pi-agent-core";
import * as qbittorrent from "./api.ts";

const getTorrentsParams = Type.Object({
  filter: Type.Optional(
    Type.Union(
      [
        Type.Literal("all"),
        Type.Literal("downloading"),
        Type.Literal("seeding"),
        Type.Literal("completed"),
        Type.Literal("paused"),
        Type.Literal("active"),
        Type.Literal("inactive"),
        Type.Literal("stalled"),
        Type.Literal("errored"),
      ],
      {
        description: "Filter torrents by state. Default: 'all'",
      },
    ),
  ),
});

export const getTorrentsTool: AgentTool<typeof getTorrentsParams> = {
  name: "get_torrents",
  description:
    "Get torrents from qBittorrent, optionally filtered by state (downloading, seeding, completed, paused, active, inactive, stalled, errored)",
  parameters: getTorrentsParams,
  label: "Fetching torrents from qBittorrent",
  async execute(_toolCallId, params) {
    const torrents = await qbittorrent.getTorrents(params.filter ?? "all");
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            torrents.map((t) => ({
              hash: t.hash,
              name: t.name,
              size: t.size,
              progress: t.progress,
              dlspeed: t.dlspeed,
              upspeed: t.upspeed,
              ratio: t.ratio,
              state: t.state,
              category: t.category,
              addedOn: t.added_on,
            })),
          ),
        },
      ],
      details: undefined,
    };
  },
};

const deleteTorrentsParams = Type.Object({
  hashes: Type.Array(Type.String(), {
    description: "Array of torrent hashes to delete",
  }),
  deleteFiles: Type.Optional(
    Type.Boolean({
      description: "Whether to also delete files from disk (default: true)",
    }),
  ),
});

export const deleteTorrentsTool: AgentTool<typeof deleteTorrentsParams> = {
  name: "delete_torrents",
  description:
    "Delete one or more torrents from qBittorrent by hash. Deletes files from disk by default.",
  parameters: deleteTorrentsParams,
  label: "Deleting torrents from qBittorrent",
  async execute(_toolCallId, params) {
    const deleteFiles = params.deleteFiles ?? true;
    await qbittorrent.deleteTorrents(params.hashes, deleteFiles);
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            success: true,
            message: `Deleted ${params.hashes.length} torrent${params.hashes.length === 1 ? "" : "s"}${deleteFiles ? " and files from disk" : ""}`,
            hashes: params.hashes,
          }),
        },
      ],
      details: undefined,
    };
  },
};
