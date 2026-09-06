import { createApp } from "vue";
import { PiniaColada } from "@pinia/colada";
import App from "./App.vue";
import { pinia } from "./pinia";
import { router } from "./router";
import "./main.css";

// Router last, so its first navigation guard runs with the cache already there.
createApp(App).use(pinia).use(PiniaColada, {}).use(router).mount("#app");
