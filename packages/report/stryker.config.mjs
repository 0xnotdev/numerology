export default {
  cleanTempDir: true,
  // Keep the Windows worker footprint bounded; report mutations run large
  // deterministic fixtures and the default eight workers can crash the native
  // Node process under memory pressure.
  concurrency: 4,
  coverageAnalysis: "perTest",
  plugins: ["@stryker-mutator/vitest-runner"],
  // Every report production module is in scope; tests and fixture-only support are not product code.
  // Risk-based production scope: calculation-to-report selection, writing,
  // serialization, evaluation, and every verifier gate. Renderer/CLI plumbing
  // has contract and snapshot coverage but is not part of this mutation gate.
  mutate: [
    "src/ranking.ts",
    "src/selection.ts",
    "src/deterministic-writer.ts",
    "src/writer-claims.ts",
    "src/writer-sections.ts",
    "src/structured-report.ts",
    "src/report-serialization.ts",
    "src/evaluation-corpus.ts",
    "src/evaluation.ts",
    "src/verification/**/*.ts",
    "!src/**/*.test.ts",
    "!src/verification/approved-copy.ts",
    // The approved writer copy and immutable section copy are registries, not
    // executable policy; their parity and unauthorized-copy rejection are
    // exercised by independent public verifier tests.
    "!src/section-copy.ts",
  ],
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
    related: false,
  },
};
