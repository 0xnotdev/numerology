#!/usr/bin/env node
import { runEngineCli } from "./fixtures";

try {
  process.stdout.write(runEngineCli(process.argv.slice(2)));
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
}
