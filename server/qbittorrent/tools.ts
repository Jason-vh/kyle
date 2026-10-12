import { Type } from "typebox";
import type { Tool } from "#server/agent/tool.ts";
import { bulletList, jsonResult } from "#server/agent/tool-result.ts";
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

const getTorrentsTool: Tool<typeof getTorrentsParams> = {
  name: "get_torrents",
  description:
    "Get torrents from qBittorrent, optionally filtered by state (downloading, seeding, completed, paused, active, inactive, stalled, errored)",
  parameters: getTorrentsParams,
  label: "Fetching torrents from qBittorrent",
  summary: "Listed torrents",
  async execute(params) {
    const torrents = await qbittorrent.getTorrents(params.filter ?? "all");
    return jsonResult(
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
    );
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

const deleteTorrentsTool: Tool<typeof deleteTorrentsParams> = {
  name: "delete_torrents",
  description:
    "Delete one or more torrents from qBittorrent by hash. Deletes files from disk by default.",
  parameters: deleteTorrentsParams,
  label: "Deleting torrents from qBittorrent",
  action: true,
  summary: (args) => {
    const count = (args.hashes as string[] | undefined)?.length ?? 0;
    if (!count) return "Deleted torrents from qBittorrent";
    return `Deleted ${count} torrent${count === 1 ? "" : "s"} from qBittorrent`;
  },
  details: (_args, payload) => {
    const { names, deletedFiles } = (payload ?? {}) as { names?: string[]; deletedFiles?: boolean };
    if (!names?.length) return undefined;
    const files = deletedFiles ? "Their files were deleted too." : "Their files were kept on disk.";
    return `${files}\n${bulletList(names)}`;
  },
  async execute(params) {
    const deleteFiles = params.deleteFiles ?? true;
    // Read the names first; once deleted, qBittorrent no longer knows them.
    const torrents = await qbittorrent.getTorrentsByHash(params.hashes);
    await qbittorrent.deleteTorrents(params.hashes, deleteFiles);
    return jsonResult({
      success: true,
      message: `Deleted ${params.hashes.length} torrent${params.hashes.length === 1 ? "" : "s"}${deleteFiles ? " and files from disk" : ""}`,
      hashes: params.hashes,
      names: torrents.map((torrent) => torrent.name),
      deletedFiles: deleteFiles,
    });
  },
};

export const qbittorrentTools = [getTorrentsTool, deleteTorrentsTool];
