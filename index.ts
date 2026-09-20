import { startServer } from "./server/server.ts";
import { startDiscordBot } from "./server/discord/client.ts";
import { startJobs } from "./server/jobs/index.ts";

const port = parseInt(process.env.PORT || "3000", 10);
startServer(port);
startDiscordBot();
startJobs();
