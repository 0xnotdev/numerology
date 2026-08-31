# Project agent memory

This file is the project's committed home for project-intrinsic agent knowledge: build, test, release, architecture, and sharp-edge notes that should travel with the code.

- Run the complete release gate with `pnpm verify`; package-focused commands are documented in each
  package README.
- Keep numerology arithmetic in `packages/numerology` and doctrine compilation/resolution in
  `packages/doctrine`. The latter consumes parsed authoring data and must remain free of YAML/file I/O,
  report planning, framework, database, prompt, and model dependencies; see `packages/doctrine/README.md`.

## Maintaining this file

Keep this file for knowledge useful to almost every future agent session in this project.
Do not repeat what the codebase already shows; point to the authoritative file or command instead.
Prefer rewriting or pruning existing entries over appending new ones.
When updating this file, preserve this bar for all agents and keep entries concise.
