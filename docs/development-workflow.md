# Development workflow

Start with `checkpoints/current.md` and the assigned checkpoint brief. A brief records affected
public contracts, acceptance conditions and open dependencies. Add a future brief when its requirements
are known; later payment/identity checkpoints should not inherit guessed requirements from an example.
Research and QA are human reference material and are excluded from ordinary agent reads.

## Contract TDD

1. Write the public contract suite for one vertical slice: happy path, boundary cases and failures.
   Confirm that it fails for the missing behavior.
2. Implement the cohesive module and its adapter. Keep tests at observable boundaries.
3. Run the affected suite and typecheck. Correct related failures together. Run `verify:fast` at
   handoff and the full `verify` gate at checkpoint completion or for database changes.

Failure is evidence to investigate, not a reason to stop after an arbitrary three turns. Once the
relevant gates pass, record the result and move forward. Mutation audits are manual offline work;
the routine gates never invoke Stryker. Coverage retains 95% branches and adds 90% lines for the
engine, doctrine and report packages. Other package contract/integration tests remain mandatory.
The full gate runs each domain suite once with coverage, including its fixtures and end-to-end tests.

## Graphify

Install Python 3.10+ and uv, then run `pnpm graph:setup` and `pnpm graph:build` from this checkout.
The upstream distribution is `graphifyy[mcp]==0.9.53` (Graphify Labs), installed as isolated developer
tooling. It is not a product dependency, CI prerequisite, or numerology runtime component.
`graph:build` uses local code-only AST extraction with clustering disabled: no LLM/API key is needed.
The allowlist in `.graphifyignore` restricts extraction to app/package code, excluding tests,
documents, secrets, generated output and dependencies. Derived `graphify-out/` stays out of Git.
Run `pnpm graph:check` after installation or upgrades: it verifies source scope, three known
cross-module call edges, MCP startup/tool discovery and a real bounded query. This optional check
requires Graphify; ordinary application verification does not.

Use `pnpm graph:query ReportPlan` for a bounded neighborhood, `pnpm graph:explain planReport` for
callers/callees, and `pnpm graph:path planReport canonicalHash` for a specific path. Query budgets
are approximate; the CLI wrapper also caps output at 6,000 characters because upstream can exceed
its budget when emitting edges. Truncation means omitted results, not absent dependencies. Refresh incrementally
at task start and after source changes; queries do not automatically refresh the graph.

The first local extraction took about seven seconds for 1,217 explicit nodes and 3,931 edges.
Planner calls to `canonicalHash`, `deepFreeze` and `validateReportPlan` matched the source. However,
the HTTP factory-to-normalizer path was missing. Graphify is navigation evidence, not a sound
runtime dependency analysis or a quality gate. Retain exact-signature lookup below and inspect
source/tests before changing behavior. No percentage token-saving or defect-reduction claim has
been established by this small trial.

### Optional Codex MCP

The local workspace has a stdio connection configured; reopen the trusted project/task to load it.
For another checkout, add the following to its `.codex/config.toml`, replacing the graph argument
with that checkout's absolute path (forward slashes work on Windows). Use the executable's absolute
path for `command` if the desktop app does not inherit the uv tool PATH. Preserve existing settings.

```toml
[mcp_servers.graphify]
command = "graphify-mcp"
args = ["/absolute/checkout/graphify-out/graph.json", "--transport", "stdio"]
enabled_tools = ["query_graph", "get_node", "get_neighbors", "shortest_path", "graph_stats"]
startup_timeout_sec = 30

[mcp_servers.graphify.tools.query_graph]
output_token_limit = 1500
```

Build the graph before connecting. Use `query_graph` with `token_budget = 1000`; start with small
neighborhoods. Restart the connection after rebuilding if it retains an old graph. Only read-only
navigation tools are exposed; extraction stays an explicit local command. Project-scoped MCP
requires a trusted project; this setup does not change trust or global configuration.
Configuration reference: <https://learn.chatgpt.com/docs/extend/mcp?surface=cli>.

## Exact-signature fallback

`pnpm code:query ReportPlan` prints at most ten exact-name matches, with source locations, signatures,
export status and syntactic type/call references. Imports retain the module and imported alias name.
Follow the returned reference names with another query, or read the identified source range.

`pnpm code:index` writes the complete index to ignored `.cache/code-symbols.json`, printing only counts.
Queries rebuild from current source so cached data cannot silently become stale. Traversal is confined
to package/app `src` directories and skips symlinks, hidden trees, tests and generated expected files.
Function bodies and variable initializers are omitted. Signatures are capped at 4,000 characters with
an explicit truncation flag. This uses the installed TypeScript parser; it adds no dependency or LLM.

This is an AST declaration/reference index, not a semantic call graph. Inferred variable types and
class/enum internals require a targeted source read. Re-exports and reference names do not prove
runtime reachability. Do not treat index output as a substitute for TypeScript compilation or tests.

## Workspace hygiene

The ordinary working checkout is `platform/` on `main`, tracking `github/main`. Keep extra worktrees
only for explicitly assigned parallel work. Before removing one, verify clean tracked/untracked status,
inspect ignored files for private configuration or irreplaceable content, and prove its HEAD is retained
in canonical history. Use normal `git worktree remove`; preserve branch refs and avoid force removal.

Use scoped `rg` searches. `.gitignore` keeps derived assets out of Git; `.ignore` also excludes them
from ripgrep searches. These files do not constrain tools that explicitly bypass ignore rules.
QA archive location and cleanup evidence are recorded in `progress.md`.
