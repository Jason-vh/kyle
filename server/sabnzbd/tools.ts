import { Type } from "typebox";
import type { Tool } from "#server/agent/tool.ts";
import { jsonResult } from "#server/agent/tool-result.ts";
import { conditionFor } from "./health.ts";
import * as sabnzbd from "./api.ts";

const QUEUE_LIMIT = 50;

const emptyParams = Type.Object({});

const getUsenetQueueTool: Tool<typeof emptyParams> = {
  name: "get_usenet_queue",
  description:
    "Get SABnzbd's download queue: whether it is paused, how fast it is going, and each usenet download's progress. Sonarr and Radarr queue items with downloadClient SABnzbd download here, not in qBittorrent.",
  parameters: emptyParams,
  label: "Checking the usenet queue",
  summary: "Checked usenet queue",
  async execute() {
    const queue = await sabnzbd.getQueue(QUEUE_LIMIT);
    return jsonResult({
      pausedIndefinitely: conditionFor(queue) === "paused",
      status: queue.status,
      speed: queue.speed,
      timeLeft: queue.timeleft,
      sizeLeft: queue.sizeleft,
      totalDownloads: queue.noofslots,
      downloads: queue.slots.map((slot) => ({
        name: slot.filename,
        category: slot.cat,
        status: slot.status,
        percentage: slot.percentage,
        sizeLeft: slot.sizeleft,
        timeLeft: slot.timeleft,
      })),
    });
  },
};

export const sabnzbdTools = [getUsenetQueueTool];
