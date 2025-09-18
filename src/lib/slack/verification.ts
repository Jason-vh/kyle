import { logStructured } from "@/lib/logger";
import type { Env } from "@/types/env";

/**
 * Verify Slack request signature
 * https://api.slack.com/authentication/verifying-requests-from-slack
 */
export async function verifySlackSignature(
	env: Env,
	signature: string,
	timestamp: string,
	body: string
): Promise<boolean> {
	if (!env.SLACK_SIGNING_SECRET) {
		logStructured("SLACK_SIGNING_SECRET not configured", {});
		return false;
	}

	// Check if request is too old (more than 5 minutes)
	const requestTime = parseInt(timestamp) * 1000;
	const currentTime = Date.now();
	const fiveMinutesAgo = currentTime - 5 * 60 * 1000;

	if (requestTime < fiveMinutesAgo) {
		logStructured("Request is too old", { timestamp, currentTime });
		return false;
	}

	try {
		// Create the signature base string
		const baseString = `v0:${timestamp}:${body}`;

		// Convert signing secret to Uint8Array for HMAC
		const signingSecret = new TextEncoder().encode(env.SLACK_SIGNING_SECRET);
		const message = new TextEncoder().encode(baseString);

		// Import the key
		const key = await crypto.subtle.importKey(
			"raw",
			signingSecret,
			{ name: "HMAC", hash: "SHA-256" },
			false,
			["sign"]
		);

		// Generate the signature
		const signature_buffer = await crypto.subtle.sign("HMAC", key, message);
		const signature_array = new Uint8Array(signature_buffer);

		// Convert to hex string
		const computedSignature = Array.from(signature_array)
			.map((b) => b.toString(16).padStart(2, "0"))
			.join("");

		const expectedSignature = `v0=${computedSignature}`;

		// Compare signatures
		const isValid = signature === expectedSignature;

		if (!isValid) {
			logStructured("Invalid signature", {
				received: signature,
				expected: expectedSignature,
				baseString: baseString.substring(0, 100) + "...",
			});
		}

		return isValid;
	} catch (error) {
		logStructured("Error verifying signature", { error });
		return false;
	}
}
