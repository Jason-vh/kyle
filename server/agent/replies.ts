import { ApiOverloadedError } from "./run.ts";

/** Stands in for a turn that produced no text at all. */
export const EMPTY_REPLY = "Sorry, I wasn't able to generate a response. Please try again.";

/** What a user sees when the turn fails outright. */
export function failureReply(error: unknown): string {
  return error instanceof ApiOverloadedError
    ? "Sorry, I'm having trouble reaching my brain right now. Give me a minute and try again?"
    : "Sorry, something went wrong processing your message.";
}
