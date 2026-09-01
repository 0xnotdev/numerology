import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    exclude: ["src/release-fixture.test.ts"],
    include: ["src/**/*.test.ts"],
  },
});
