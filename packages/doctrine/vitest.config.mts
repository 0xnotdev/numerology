import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      all: true,
      exclude: ["src/**/*.test.ts", "src/cli-main.ts", "src/index.ts", "src/test-fixtures.ts"],
      include: ["src/**/*.ts"],
      provider: "v8",
      reporter: ["text", "json", "json-summary"],
      thresholds: {
        branches: 95,
      },
    },
    include: ["src/**/*.test.ts"],
  },
});
