import { runReportCli } from "./cli";

process.exitCode = await runReportCli(process.argv.slice(2));
