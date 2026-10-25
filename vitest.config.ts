import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  server: {
    deps: {
      inline: [/@carbon/, /temporal-polyfill/],
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    testTimeout: 15000,
    setupFiles: ["./src/test/setup.ts"],
    include: [
      "src/**/*.{test,spec}.{ts,tsx}",
      "tests/unit/**/*.{test,spec}.{ts,tsx}",
    ],
    exclude: ["node_modules", ".next", "e2e", "tests/e2e"],
    server: {
      deps: {
        inline: [/@carbon/, /temporal-polyfill/],
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
