import { createPinia } from "pinia";

/**
 * Its own module because the router guard needs the query cache, and reaching
 * into `main.ts` for it would be circular.
 */
export const pinia = createPinia();
