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

## Symbol queries

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
