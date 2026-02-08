import { startServer } from "./src/server.ts";

const port = parseInt(process.env.PORT || "3000", 10);
startServer(port);
