import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  outputDir: ".e2e/results",
  use: { baseURL: "http://localhost:4173", trace: "retain-on-failure" },
  webServer: {
    command: "bun run e2e/server.ts",
    url: "http://localhost:4173/health",
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
