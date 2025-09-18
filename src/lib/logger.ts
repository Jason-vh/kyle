export function logStructured(
	message: string,
	args: Record<string, unknown> = {}
) {
	console.log({
		message,
		...args,
	});
}

export const createLogger = (scope: string) => {
	return {
		debug(message: string, args: Record<string, unknown> = {}) {
			console.debug({
				message: `[${scope}] ${message}`,
				...args,
			});
		},
		log(message: string, args: Record<string, unknown> = {}) {
			console.log({
				message: `[${scope}] ${message}`,
				...args,
			});
		},
		error(message: string, args: Record<string, unknown> = {}) {
			console.error({
				message: `[${scope}] ${message}`,
				...args,
			});
		},
	};
};
