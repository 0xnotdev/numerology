# Numerology calculation engine

Checkpoint 2's pure calculation package. It owns profile-aware arithmetic and identity/date
normalization for the declared Western/Decoz, Balliett, Cheiro, Johari, and Lo Shu profiles.
Every bundle keeps profile IDs, compounds, reduction traces, warnings, and canonical SHA-256 hashes.
The package has no database, model, network, or filesystem dependency during calculation.

## Local fixture CLI

The CLI is for synthetic review only; it is not a public API:

```powershell
pnpm engine list-fixtures
pnpm engine calculate --fixture G-W-LP-001
```

Unsupported scripts, unconfirmed transliterations, unsupported letters, and the excluded Johari
pre-dawn boundary are explicit warnings or safe failures. Profile differences are retained rather
than averaged. The governing specification is the project's technical build bible; see the root
`progress.md` for the release boundary and verification evidence.
