import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    exclude: ["src/cli.test.ts", "src/end-to-end.test.ts", "src/fixture.test.ts"],
    include: ["src/**/*.test.ts"],
  },
});
