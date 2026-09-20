#!/usr/bin/env bun
import { sweep } from "#server/janitor/run.ts";
import { formatBytes } from "#server/ultra/health.ts";

const apply = process.argv.includes("--apply");
const report = await sweep(apply);

for (const action of report.actions) {
  const bytes = "bytes" in action && action.bytes > 0 ? ` (${formatBytes(action.bytes)})` : "";
  console.log(`${action.kind.padEnd(16)} ${action.subject}${bytes} — ${action.reason}`);
}

const summary = `${report.applied} applied, ${report.failed} failed, ${report.actions.length} decided`;
console.log(apply ? `\n${summary}` : `\n${summary} — dry run, nothing was changed`);
