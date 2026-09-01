export default {
  cleanTempDir: true,
  concurrency: 8,
  coverageAnalysis: "perTest",
  plugins: ["@stryker-mutator/vitest-runner"],
  mutate: ["src/ranking.ts", "src/selection.ts"],
  reporters: ["clear-text", "json"],
  thresholds: {
    break: 90,
    high: 90,
    low: 90,
  },
  testRunner: "vitest",
  timeoutMS: 10000,
  vitest: {
    configFile: "vitest.stryker.config.mts",
  },
};
