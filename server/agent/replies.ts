import { ApiOverloadedError, TurnStoppedError } from "./errors.ts";

/** Stands in for a turn that produced no text at all. */
export const EMPTY_REPLY = "Sorry, I wasn't able to generate a response. Please try again.";

export const STOPPED_REPLY = "Stopped.";

/** What a user sees when the turn fails outright. */
export function failureReply(error: unknown): string {
  if (error instanceof TurnStoppedError) return STOPPED_REPLY;
  if (error instanceof ApiOverloadedError) {
    return "Sorry, I'm having trouble reaching my brain right now. Give me a minute and try again?";
  }
  return "Sorry, something went wrong processing your message.";
}
