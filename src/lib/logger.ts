import { Axiom } from "@axiomhq/js";
import {
	AxiomJSTransport,
	ConsoleTransport,
	Logger,
	type Transport,
} from "@axiomhq/logging";

const transports: [Transport, ...Transport[]] = [
	new ConsoleTransport({
		prettyPrint: true,
		logLevel: "debug",
	}),
];

if (
	Bun.env.NODE_ENV === "production" &&
	Bun.env.AXIOM_TOKEN &&
	Bun.env.AXIOM_DATASET
) {
	console.log("Logging to Axiom dataset", Bun.env.AXIOM_DATASET);

	const axiom = new Axiom({
		token: Bun.env.AXIOM_TOKEN,
	});

	transports.push(
		new AxiomJSTransport({ axiom, dataset: Bun.env.AXIOM_DATASET })
	);
}

const logger = new Logger({
	transports,
});

export function createLogger(scope: string) {
	return {
		debug(message: string, args: Record<string, unknown> = {}) {
			logger.debug(`[${scope}] ${message}`, args);
		},
		info(message: string, args: Record<string, unknown> = {}) {
			logger.info(`[${scope}] ${message}`, args);
		},
		error(message: string, args: Record<string, unknown> = {}) {
			logger.error(`[${scope}] ${message}`, args);
		},
		warn(message: string, args: Record<string, unknown> = {}) {
			logger.warn(`[${scope}] ${message}`, args);
		},
	};
}
