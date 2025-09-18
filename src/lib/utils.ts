import { logStructured } from "@/lib/logger";

/**
 * When an error occurs, let's both log it and return a readable message for the AI to read.
 */
export const handleError = (errorMessage: string, error: unknown): string => {
	logStructured(errorMessage, { error });

	const aiError = `${errorMessage}: ${
		error instanceof Error ? error.message : JSON.stringify(error)
	}`;

	// Log for AI visibility
	logStructured("(ai error):", { aiError });
	return aiError;
};
