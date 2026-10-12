import { startServer } from "./server/server.ts";
import { startDiscordBot } from "./server/discord/client.ts";
import { startJobs } from "./server/jobs/index.ts";
import { startHarness } from "./server/durable/harness.ts";

const port = parseInt(process.env.PORT || "3000", 10);
await startHarness();
startServer(port);
startDiscordBot();
startJobs();
