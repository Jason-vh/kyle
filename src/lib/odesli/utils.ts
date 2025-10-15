import type { OdesliResponse } from "@/lib/odesli/types";

export function toPartialOdesliResponse(
	response: OdesliResponse
): OdesliResponse["linksByPlatform"] {
	return response.linksByPlatform;
}
