import { defineConfig } from "vitest/config";
import vue from "@vitejs/plugin-vue";
import tailwindcss from "@tailwindcss/vite";
import icons from "unplugin-icons/vite";
import path from "path";

export default defineConfig({
  plugins: [vue(), tailwindcss(), icons({ compiler: "vue3" })],
  resolve: {
    alias: {
      // `#` names a source root, matching the server's package.json imports.
      "#web": path.resolve(__dirname, "./src"),
      "#shared": path.resolve(__dirname, "../shared"),
    },
  },
  server: {
    proxy: {
      "/api": "http://localhost:3000",
    },
  },
  test: {
    environment: "happy-dom",
    include: ["src/**/*.test.ts"],
  },
});
