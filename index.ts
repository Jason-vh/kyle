import { startServer } from "./server/server.ts";
import { startDiscordBot } from "./server/discord/client.ts";
import { startJobs } from "./server/jobs/index.ts";
import { startHarness } from "./server/durable/harness.ts";
import { finishInterruptedTurns } from "./server/agent/recovery.ts";

const port = parseInt(process.env.PORT || "3000", 10);
const harness = await startHarness();
startServer(port);
startDiscordBot();
startJobs();
void finishInterruptedTurns(harness);
