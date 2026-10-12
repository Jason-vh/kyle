import { startServer } from "./server/server.ts";
import { startDiscordBot } from "./server/discord/client.ts";
import { startJobs } from "./server/jobs/index.ts";
import { startHarness } from "./server/durable/harness.ts";
import { finishInterruptedTurns } from "./server/agent/recovery.ts";
import { importLegacyConversations } from "./server/agent/conversation.ts";

const port = parseInt(process.env.PORT || "3000", 10);
const harness = await startHarness();
await importLegacyConversations(harness);
startServer(port);
startDiscordBot();
startJobs();
void finishInterruptedTurns(harness);
