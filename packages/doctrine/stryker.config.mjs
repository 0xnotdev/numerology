export default {
  cleanTempDir: true,
  // Mutation scope is the canonical rule ingestion, content-integrity, branded-identifier, and
  // declarative trigger boundary. Compilation, resolution, and editorial I/O remain enforced by the
  // deterministic fixture suite and the package-wide >=95% V8 branch gate.
  concurrency: 8,
  coverageAnalysis: "perTest",
  plugins: ["@stryker-mutator/vitest-runner"],
  mutate: ["src/canonical-rule.ts", "src/conditions.ts", "src/content-hash.ts", "src/ids.ts"],
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
