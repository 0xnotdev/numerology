export default {
  cleanTempDir: true,
  // Mutation scope is the profile formula layer; shared validation and serialization boundaries have
  // complete fixture and branch-coverage gates.
  concurrency: 8,
  coverageAnalysis: "perTest",
  plugins: ["@stryker-mutator/vitest-runner"],
  mutate: ["src/cheiro.ts", "src/johari.ts", "src/lo-shu.ts", "src/western.ts"],
  reporters: ["clear-text", "json"],
  thresholds: {
    break: 90,
    high: 90,
    low: 90,
  },
  testRunner: "vitest",
  timeoutMS: 10000,
  vitest: {
    configFile: "vitest.config.mts",
  },
};
