import { spawnSync } from "node:child_process";

const question = process.argv.slice(2).join(" ").trim();
if (!question || question.startsWith("-")) {
  console.error("Usage: pnpm graph:query SymbolOrQuestion");
  process.exit(1);
}
// Graphify parses the question before flags; its own budget can also be exceeded by edges.
const result = spawnSync("graphify", ["query", question, "--budget", "1000"], {
  cwd: new URL("..", import.meta.url),
  encoding: "utf8",
  maxBuffer: 2 * 1024 * 1024,
  timeout: 30000,
});
if (result.error) {
  console.error(`Graphify unavailable: ${result.error.message}. Run pnpm graph:setup first.`);
  process.exit(1);
}
const output = result.stdout ?? "";
const limit = 6000;
process.stdout.write(output.slice(0, limit));
if (output.length > limit) {
  console.log(
    "\n[Output capped at 6,000 characters; narrow the query or inspect a specific node.]",
  );
}
if (result.stderr) process.stderr.write(result.stderr.slice(0, 2000));
process.exitCode = result.status ?? 1;
