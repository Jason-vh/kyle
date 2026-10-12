#!/usr/bin/env bun
import { sweep } from "#server/janitor/run.ts";
import { formatBytes } from "#server/ultra/health.ts";

// A dry run only: changes belong to the server's own nightly sweep, whose locks this process cannot see.
const report = await sweep(false);

for (const action of report.actions) {
  const bytes = "bytes" in action && action.bytes > 0 ? ` (${formatBytes(action.bytes)})` : "";
  console.log(`${action.kind.padEnd(16)} ${action.subject}${bytes} — ${action.reason}`);
}

console.log(
  `\n${report.applied} applied, ${report.failed} failed, ${report.actions.length} decided — dry run, nothing was changed`,
);
