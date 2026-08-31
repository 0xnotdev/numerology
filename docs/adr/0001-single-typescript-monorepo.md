# ADR 0001: One TypeScript monorepo with separate web and worker processes

- Status: Accepted
- Date: 2026-08-31

## Context

V1 needs a customer web experience and durable report generation without the operational cost of
independent services or duplicated contracts.

## Decision

Use one pnpm TypeScript monorepo. Deploy the same revision as a Next.js web process and, from
Checkpoint 7, a long-running worker process. Put deterministic domain code and data contracts in
framework-independent packages.

## Consequences

Deployment stays lean and contracts are shared. A bad module boundary can still couple the web to
the worker, so packages may depend inward on domain modules but domain modules may not import Next,
database, payment, storage, email, or LLM SDKs.

## Migration trigger

Extract a service only when it needs an independent security boundary, deployment cadence, runtime,
or scaling profile proven by production measurements.
