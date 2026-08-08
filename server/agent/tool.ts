import type { AgentTool } from "@mariozechner/pi-agent-core";
import type { TSchema } from "@sinclair/typebox";
import type { ResultTable } from "./table.ts";

/**
 * An agent tool plus everything the interfaces need to talk about it.
 *
 * Presentation lives with the tool so adding one means touching a single file;
 * the registry is the only place that maps a tool name back to its definition.
 */
export interface Tool<P extends TSchema = TSchema> extends AgentTool<P> {
  /**
   * Past-tense title for a finished action ("Removed movie from Radarr"). Its
   * presence marks the tool as an action worth surfacing in the UI; lookups run
   * constantly and say nothing useful, so they leave it unset.
   */
  completedLabel?: string;
  /** Narrows "is this an action" for tools that both read and write. */
  isAction?: (args: Record<string, unknown>) => boolean;
  /** One-line, past-tense description of a call for the thread viewer. */
  summary?: string | ((args: Record<string, unknown>) => string);
  /** Renders the tool's JSON payload as a table, for clients that show tables. */
  table?: (payload: unknown) => ResultTable | undefined;
}

/** Heterogeneous collections of tools; each entry has its own parameter schema. */
// oxlint-disable-next-line no-explicit-any
export type AnyTool = Tool<any>;

/** Everything the interfaces need to describe a tool call, without being able to run it. */
export type ToolPresentation = Pick<
  AnyTool,
  "name" | "label" | "completedLabel" | "isAction" | "summary" | "table"
>;
