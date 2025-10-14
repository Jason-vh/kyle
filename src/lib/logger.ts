import { Axiom } from "@axiomhq/js";
import { AxiomJSTransport, ConsoleTransport, Logger } from "@axiomhq/logging";

if (!Bun.env.AXIOM_TOKEN || !Bun.env.AXIOM_DATASET) {
	throw new Error("AXIOM_TOKEN or AXIOM_DATASET are not set");
}

console.log("Logging to Axiom dataset", Bun.env.AXIOM_DATASET);

const axiom = new Axiom({
	token: Bun.env.AXIOM_TOKEN,
});

const logger = new Logger({
	transports: [
		new AxiomJSTransport({
			axiom,
			dataset: Bun.env.AXIOM_DATASET,
		}),
		new ConsoleTransport({
			prettyPrint: true,
			logLevel: "debug",
		}),
	],
});

export const createLogger = (scope: string) => {
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
};
