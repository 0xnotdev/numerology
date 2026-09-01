#!/usr/bin/env node
import { runDoctrineCli } from "./cli";

process.exitCode = await runDoctrineCli(process.argv.slice(2));
