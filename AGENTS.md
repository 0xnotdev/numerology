# Working context

Use this checkout (`platform/`, branch `main`) for ordinary work. Check Git status first and preserve
unrelated edits. Start with `checkpoints/current.md` and the brief for the assigned checkpoint.

- Load only the brief, affected public interfaces and relevant tests. For structural questions, run
  `pnpm graph:build` once at task start and after source edits, then `pnpm graph:query Symbol`.
  Follow returned source locations selectively; use `pnpm code:query Symbol` for exact signatures
  or scoped `rg` for missing edges. Graph absence is not proof of runtime independence.
  For setup or MCP access, read the Graphify section in `docs/development-workflow.md`.
- Research, QA renders and deliverables are human reference assets. Do not read or crawl `research/`,
  `qa/` or `deliverables/` during agent implementation. Record a missing requirement in the checkpoint
  brief rather than inventing a rule. A later explicit request to inspect a reference overrides this.
- Contract TDD: write one public contract suite for a coherent vertical slice, confirm the intended
  failure, implement the slice, then run the affected suite and typecheck. Correct failures together.
  Run `pnpm verify:fast` at handoff; use `pnpm verify` for checkpoint completion/CI and database changes.
  Repeat only failing or affected checks. Mutation audits are manual offline work, outside this loop.
- Keep arithmetic in `packages/numerology`, doctrine in `packages/doctrine`, use cases in
  `packages/application`, and persistence in `packages/database`. Reporting consumes those contracts.
  Use `@numerology/shared` for recursive freezing. Launch behavior is deterministic.
- Update `checkpoints/current.md` at handoff and append concise evidence/decisions to `progress.md`
  after each slice or material decision. Use targeted search for historical evidence; the full ledger
  is not startup context.
- Search named source directories. Keep command output to failure summaries and counts. Reuse the
  main checkout; create another worktree only for an explicitly assigned parallel task.
