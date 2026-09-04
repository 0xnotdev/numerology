# Deterministic report quality (Checkpoint 7)

This is an internal, synthetic-only operator workflow. It neither deploys a release nor enables
payments, customer traffic or report delivery. V1 uses no LLM. The customer projection continues to
exclude internal scores, confidence, ranking, evidence identifiers and verification records.

## What an evaluation means

`report evaluate` is the legacy reproducibility command: exit 0 means the evaluation executed, not
that its reports are ready to sell. The CP7 quality command makes acceptance a separate decision.
It reruns the actual engine, doctrine, planner, deterministic writer and independent verifier.
It must not accept a caller's precomputed `eligible: true` or a self-rehashed outcome summary as proof.

The frozen corpus contains 60 synthetic subjects: 20 each in English, Hindi and Odia. Ordinary
subjects need successful verified reports. Adversarial subjects need the relevant rejection, not an
unrelated exception. Unsupported requested locales remain failures, not removed denominator entries.
An English-only assessment does not approve Hindi or Odia.

The initial fallback corpus produces 7 verified English reports, 8 ordinary English generation
failures, 5 rejected English adversarial cases and 40 unsupported Hindi/Odia cases. The eight ordinary
failures are `WRITER_CLAIM_CARDINALITY`. Changing the expected snapshot or reducing the minimum claim
count is not a content-coverage fix. No native-language approval has been supplied for this release.

Two original acceptance measurements are not yet available: corpus-wide pairwise interpretation
overlap below 15% (excluding approved boilerplate), and glossary adherence at least 98%. The current
single-report similarity check against a synthetic reference passage is not a pairwise corpus test;
the locale-script gate is not a glossary score. These remain explicitly unassessed production
acceptance blockers. Do not translate their absence into a passing score or weaken them to promote.

## Native review

Use only the exact generated synthetic reports identified by an evaluation artifact. Reviewers must
be proficient in the requested language and review the complete required report set for that locale.
Do not send real customer details to reviewers. A content change, corpus change, locale change or
version change requires matching evaluation/review evidence; an old approval cannot silently follow it.

Score these ten dimensions from 1 to 5:

| Dimension | Review question |
| --- | --- |
| Naturalness | Does the language read naturally to a native reader? |
| Clarity | Can a reader understand the charts and explanations? |
| Personalization | Is the interpretation meaningfully tied to this synthetic chart? |
| Nuance | Are distinctions and conflicting traditions explained without false certainty? |
| Balance | Does the report avoid both fearmongering and indiscriminate praise? |
| Usefulness | Are the explanations and optional practices understandable and practical? |
| Tradition honesty | Are traditional interpretations presented honestly, without scientific guarantees? |
| Tone | Is the language respectful and non-coercive? |
| Navigation | Can readers find and follow the information they need? |
| Value for money | Is this a worthwhile, coherent report for the advertised ₹499 product? |

Acceptance requires each requested locale's mean at least 4.2, every dimension at least 4.0, and no
factual or safety flags. Strong scores in one language cannot compensate for weak scores in another.
A factual or safety error fails the review regardless of the numerical scores. Missing, incomplete,
stale or mismatched reviews cannot approve a locale. Automated agents must not invent reviewer
identities or substitute their own generated scores for actual native review.

Review identities and approvals are trusted operator inputs, not cryptographic attestations. Hashes
bind exact content and detect drift; they do not authenticate a reviewer. Protect review artifacts
and release history through repository access controls and independent review.

The `--reviews` file is a JSON array with one review per requested locale. Each review contains:

- `artifactHash`: the exact assessment/reviewer-packet identity.
- `locale`, `reviewerId`, and `reviewedAt`: the language, accountable operator-managed identity and
  canonical UTC timestamp, such as the format `YYYY-MM-DDTHH:mm:ss.sssZ`.
- `reviewedReportHashes`: the sorted, unique hashes of every ordinary verified report for that locale.
  Reviewing an empty set is not approval. Remaining generation failures still block the release.
- `scores`: all ten rubric keys (`naturalness`, `clarity`, `personalization`, `nuance`, `balance`,
  `usefulness`, `tradition_honesty`, `tone`, `navigation`, `value_for_money`).
- `factualFlag` and `safetyFlag`: actual reviewer findings, not default unchecked approvals.
- Optional `notes`; optional `reviewHash`, which is computed internally when omitted and verified
  when supplied. Do not edit a sealed review while retaining its old hash.

These are operator attestations, not generated evidence. Only submit them after the human review.

## Promotion, rollback and release readiness

Promotion must name the exact evaluated artifact and locales. Rollback is a deliberate selection of
a previously approved artifact, not permission to pick any older file. Current evaluation and review
evidence must still satisfy the policy. These commands rehearse decisions locally; deployment,
traffic control, release ownership and production approval remain separate operational gates.

Keep the previous approved software/content artifacts available with their matching runtime versions.
If the current runtime cannot reproduce an older artifact, evaluate it in its matching versioned
checkout. Do not relabel old reports with current version numbers to make a rollback pass.

Software acceptance for CP7 means the quality controls work and are tested. It does not mean the
current fallback corpus has passed product-quality acceptance. Content coverage, reviewed locale
packs, actual native review and the remaining production launch gates must be satisfied separately.

## Verification

Use contract tests at the quality CLI and public release-policy interface. Existing engine, doctrine,
report verification and customer-projection regression tests remain mandatory. Run the full
`pnpm verify` at checkpoint completion. Mutation testing remains an optional offline audit, never an
agent development-loop requirement.

## Commands and output handling

From the repository root:

```bash
pnpm report quality --release data/doctrine/releases/checkpoint4-fallback.compiled.json \
  --corpus data/report/eval-subjects.json --locales en-IN \
  --output reports/cp7-quality.json --review-output reports/cp7-review-packet.json
```

Exit 4 is the expected result for the current blocked corpus, not a command crash. Other exits:
0 eligible under the evaluated policy, 1 I/O or unexpected failure, 2 usage error, 3 invalid input.
The optional reviewer packet exports the exact ordinary verified structured reports and their
identifiers/hashes; rejected and adversarial bodies are excluded. It is an internal review artifact,
not a customer-facing report. The assessment and packet bind the same artifact hash.

Supply `--reviews <path>` only with actual native review evidence. Operator release decisions use
`pnpm report release-decision --request <path> [--output <path>]`; the request contains `action`
(`promote` or `rollback`), the candidate `corpus` and compiled `release`, `requestedLocales`, optional
`reviews`, the exact `target` (`artifactHash` and `locales`) and `history`. The public TypeScript
contracts in `packages/report/src/quality.ts` define the strict JSON shapes. Candidate eligibility is
recomputed; history is not a shortcut around a failed current evaluation.

Generated files under the repository-root `reports/` directory are ignored by Git. Do not commit
real reviewer personal information or private operator notes. Ordinary evaluation logs should show
diagnostic codes/counts, not full input records or report prose.
