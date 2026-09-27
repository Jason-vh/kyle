import { createApp } from "vue";
import { PiniaColada } from "@pinia/colada";
import { PiniaColadaCachePersister } from "@pinia/colada-plugin-cache-persister";
import App from "./App.vue";
import { pinia } from "./pinia";
import { router } from "./router";
import { isKeptBetweenVisits } from "./queries/kept";
import "@fontsource-variable/inter";
import "@fontsource-variable/jetbrains-mono";
import "./main.css";

const persister = PiniaColadaCachePersister({
  key: "kyle-query-cache",
  filter: { predicate: isKeptBetweenVisits },
});

// Router last, so its first navigation guard runs with the cache already there.
createApp(App)
  .use(pinia)
  .use(PiniaColada, { plugins: [persister] })
  .use(router)
  .mount("#app");
