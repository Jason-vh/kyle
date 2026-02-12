type LogLevel = "info" | "warn" | "error";

interface LogEntry {
	level: LogLevel;
	module: string;
	msg: string;
	timestamp: string;
	[key: string]: unknown;
}

function emit(level: LogLevel, module: string, msg: string, data?: Record<string, unknown>) {
	const entry: LogEntry = {
		level,
		module,
		msg,
		timestamp: new Date().toISOString(),
		...data,
	};
	const line = JSON.stringify(entry);
	if (level === "error") {
		console.error(line);
	} else {
		console.log(line);
	}
}

export function createLogger(module: string) {
	return {
		info(msg: string, data?: Record<string, unknown>) {
			emit("info", module, msg, data);
		},
		warn(msg: string, data?: Record<string, unknown>) {
			emit("warn", module, msg, data);
		},
		error(msg: string, data?: Record<string, unknown>) {
			emit("error", module, msg, data);
		},
	};
}
