import { Type } from "@sinclair/typebox";
import type { AgentTool } from "@mariozechner/pi-agent-core";

const convertTimeParams = Type.Object({
  time: Type.String({ description: 'Time to convert, e.g. "8:00 PM", "20:00", "3:30 PM"' }),
  fromTimezone: Type.String({
    description: 'Source IANA timezone, e.g. "America/New_York", "Europe/London", "UTC"',
  }),
  toTimezone: Type.String({
    description: 'Target IANA timezone, e.g. "America/Los_Angeles", "Europe/Amsterdam", "UTC"',
  }),
  date: Type.Optional(
    Type.String({ description: "Date for the conversion (YYYY-MM-DD). Defaults to today." }),
  ),
});

export const convertTimeTool: AgentTool<typeof convertTimeParams> = {
  name: "convert_time",
  description:
    "Convert a time between timezones. Handles date boundary crossings (e.g. 8 PM ET → 1 AM UTC next day). Use IANA timezone names.",
  parameters: convertTimeParams,
  label: "Converting timezone",
  async execute(_toolCallId, { time, fromTimezone, toTimezone, date }) {
    const dateStr = date ?? new Date().toISOString().split("T")[0]!;

    // Parse the input time
    const match = time.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
    if (!match) {
      return {
        content: [
          { type: "text", text: JSON.stringify({ error: `Cannot parse time: "${time}"` }) },
        ],
        details: undefined,
      };
    }

    let hours = parseInt(match[1]!, 10);
    const minutes = parseInt(match[2]!, 10);
    const ampm = match[3]?.toUpperCase();

    if (ampm === "PM" && hours !== 12) hours += 12;
    if (ampm === "AM" && hours === 12) hours = 0;

    // Build a date in the source timezone and format in the target
    const sourceDate = new Date(
      `${dateStr}T${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:00`,
    );

    // Use Intl to find the UTC offset of the source timezone
    const sourceFormatted = new Intl.DateTimeFormat("en-US", {
      timeZone: fromTimezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).format(sourceDate);

    // Parse what that wall-clock time would be, then find the difference
    const [datePart, timePart] = sourceFormatted.split(", ");
    const [mo, da, yr] = datePart!.split("/");
    const naiveSourceStr = `${yr}-${mo}-${da}T${timePart}`;
    const naiveSource = new Date(naiveSourceStr);
    const offsetMs = naiveSource.getTime() - sourceDate.getTime();

    // The actual UTC time for the requested wall-clock time in the source tz
    const utcTime = new Date(sourceDate.getTime() - offsetMs);

    // Format in the target timezone
    const targetFormatter = new Intl.DateTimeFormat("en-US", {
      timeZone: toTimezone,
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZoneName: "short",
    });

    const sourceFormatter = new Intl.DateTimeFormat("en-US", {
      timeZone: fromTimezone,
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZoneName: "short",
    });

    const result = {
      input: sourceFormatter.format(utcTime),
      converted: targetFormatter.format(utcTime),
      utc: utcTime.toISOString(),
    };

    return {
      content: [{ type: "text", text: JSON.stringify(result) }],
      details: undefined,
    };
  },
};
