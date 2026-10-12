import type { ImageContent, TextContent, Tool as ModelTool } from "@earendil-works/pi-ai";
import type { Static, TSchema } from "typebox";
import type { ResultTable } from "./table.ts";

export interface ToolResult {
  content: (TextContent | ImageContent)[];
}

/**
 * An agent tool plus everything the interfaces need to talk about it.
 *
 * Presentation lives with the tool so adding one means touching a single file;
 * the registry is the only place that maps a tool name back to its definition.
 * `execute` takes only the arguments, so the same definition fits whichever
 * runner drives the agent.
 */
export interface Tool<P extends TSchema = TSchema> extends ModelTool<P> {
  /** Human-readable progress line shown while the tool runs. */
  label: string;
  /** Throws on failure; the runner reports the error to the model. */
  execute(args: Static<P>): Promise<ToolResult>;
  /**
   * Marks a tool that changes something, so it is worth surfacing as a task card.
   * Lookups run constantly and say nothing useful, so they leave it unset. Tools
   * that both read and write decide from their arguments.
   */
  action?: boolean | ((args: Record<string, unknown>) => boolean);
  /**
   * One-line, past-tense description of a finished call: "Removed Inception (2010)
   * from Radarr". The payload is the tool's own JSON result, which is usually where
   * the name of the thing acted on lives; it is absent for a call that never
   * finished, so always keep a sensible fallback.
   */
  summary?: string | ((args: Record<string, unknown>, payload?: unknown) => string);
  /**
   * Markdown shown under a finished action's summary: what the summary has no room
   * for, such as the names of what was acted on. Leave it out when the summary says
   * it all.
   */
  details?: (args: Record<string, unknown>, payload?: unknown) => string | undefined;
  /** Renders the tool's JSON payload as a table, for clients that show tables. */
  table?: (payload: unknown) => ResultTable | undefined;
}

/** Heterogeneous collections of tools; each entry has its own parameter schema. */
// oxlint-disable-next-line no-explicit-any
export type AnyTool = Tool<any>;

/** Everything the interfaces need to describe a tool call, without being able to run it. */
export type ToolPresentation = Pick<
  AnyTool,
  "name" | "label" | "action" | "summary" | "details" | "table"
>;
