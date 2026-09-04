import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { createInterface } from "node:readline";

// Optional developer smoke check: requires graph:setup and graph:build, never runs in CI.
const query = spawnSync(process.execPath, ["scripts/query-graphify.mjs", "ReportPlan"], {
  cwd: new URL("..", import.meta.url),
  encoding: "utf8",
  timeout: 30000,
});
assert.equal(query.status, 0, query.stderr);
assert.match(query.stdout, /packages\/report\/src\/types.ts/);
assert.ok(query.stdout.length < 6200, "CLI query must remain bounded");
const graph = JSON.parse(await readFile(new URL("../graphify-out/graph.json", import.meta.url)));
assert.ok(graph.nodes.length > 0, "Graph must contain code");
for (const item of [...graph.nodes, ...graph.edges]) {
  if (!item.source_file) continue;
  const path = item.source_file.replaceAll("\\", "/");
  assert.match(path, /^(apps|packages)\//);
  assert.doesNotMatch(
    path,
    /(^|\/)(node_modules|research|qa|deliverables|coverage|dist|build|graphify-out|migrations|\.[^/]+)(\/|$)|\.(test|spec|expected|config)\.|\.(json|jsonl|md|mdx|yaml|yml|html|svg|css|tsbuildinfo)$/,
  );
}
const planner = graph.nodes.find((node) => node.label === "planReport()");
assert.ok(planner, "Report planner must be indexed");
for (const callee of ["canonicalHash()", "deepFreeze()", "validateReportPlan()"]) {
  const targets = graph.nodes.filter((node) => node.label === callee).map((node) => node.id);
  assert.ok(
    graph.edges.some(
      (edge) =>
        edge.source === planner.id && targets.includes(edge.target) && edge.relation === "calls",
    ),
    `Missing known call: planReport -> ${callee}`,
  );
}

const child = spawn("graphify-mcp", ["graphify-out/graph.json", "--transport", "stdio"], {
  cwd: new URL("..", import.meta.url),
  stdio: ["pipe", "pipe", "pipe"],
});
const pending = new Map();
let sequence = 0;
let stderr = "";
const fail = (error) => {
  for (const request of pending.values()) request.reject(error);
  pending.clear();
};
child.on("error", fail);
child.on("exit", (code) => fail(new Error(`MCP exited (${code}): ${stderr}`)));
child.stderr.on("data", (chunk) => {
  stderr = (stderr + chunk).slice(-2000);
});
const lines = createInterface({ input: child.stdout });
lines.on("line", (line) => {
  try {
    const message = JSON.parse(line);
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    if (message.error) request.reject(new Error(JSON.stringify(message.error)));
    else request.resolve(message.result);
  } catch (error) {
    fail(error);
  }
});
async function rpc(method, params) {
  const id = ++sequence;
  let timer;
  try {
    return await new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      timer = setTimeout(() => reject(new Error(`MCP timeout: ${method}`)), 15000);
      child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
    });
  } finally {
    clearTimeout(timer);
    pending.delete(id);
  }
}
try {
  await rpc("initialize", {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "numerology-graph-smoke", version: "1.0.0" },
  });
  child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })}\n`);
  const { tools } = await rpc("tools/list", {});
  for (const name of ["query_graph", "get_node", "get_neighbors", "shortest_path", "graph_stats"]) {
    assert.ok(
      tools.some((tool) => tool.name === name),
      `Missing MCP tool ${name}`,
    );
  }
  const result = await rpc("tools/call", {
    name: "query_graph",
    arguments: { question: "ReportPlan", token_budget: 1000 },
  });
  assert.ok(!result.isError, JSON.stringify(result));
  assert.match(JSON.stringify(result), /ReportPlan/);
  console.log(
    `Graphify OK: ${graph.nodes.length} nodes, ${graph.edges.length} edges; scope, calls, MCP query passed.`,
  );
} finally {
  lines.close();
  child.kill();
}
