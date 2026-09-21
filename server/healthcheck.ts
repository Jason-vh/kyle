import { isObject } from "./http/input.ts";

export async function verifyDeployment(url: string, expectedDeployId: string): Promise<void> {
  const response = await fetch(url, { signal: AbortSignal.timeout(5_000) });
  if (!response.ok) throw new Error(`Health check returned ${response.status}`);
  const health = await response.json();
  if (!isObject(health) || health.status !== "healthy") {
    throw new Error("Application is not healthy");
  }
  if (health.deployId !== expectedDeployId) {
    throw new Error(`Expected deployment ${expectedDeployId}, received ${health.deployId}`);
  }
}

if (import.meta.main) {
  await verifyDeployment(
    `http://localhost:${process.env.PORT || "3000"}/health`,
    process.env.EXPECTED_DEPLOY_ID || process.env.DEPLOY_ID || "dev",
  );
}
