import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { Clock } from "./clock";
import { createPrivateAccessHttpHandlers, type PrivateAccessRepository } from "./private-access";
import { createSessionAuthentication, type SessionRepository } from "./session-authentication";

const now = new Date("2026-09-04T00:00:00.000Z");
const principalId = "0199a72d-3f45-7df1-a730-1722c2538a30";
const reportId = "00000000-0000-4000-8000-000000000031";
const token = "A".repeat(43);
const csrf = "B".repeat(43);
const digest = (purpose: string, value: string) =>
  createHash("sha256").update(`numerology:${purpose}:v1:${value}`).digest();

const clock: Clock = { now: () => now };

function sessionRepository(
  session: Awaited<ReturnType<SessionRepository["findActive"]>>,
): SessionRepository {
  return { findActive: async () => session };
}

function emptyRepository(
  overrides: Partial<PrivateAccessRepository> = {},
): PrivateAccessRepository {
  return {
    appendAudit: async () => undefined,
    createLifecycleRequest: async () => null,
    findEntitledReport: async () => null,
    listEntitledReports: async () => [],
    revokeAllSessions: async () => 0,
    ...overrides,
  };
}

describe("request-local private session policy", () => {
  it("derives identity from the live session and requires origin-bound CSRF", async () => {
    const session = {
      authenticatedAt: now,
      csrfDigest: digest("csrf", csrf),
      principalId,
    };
    const authentication = createSessionAuthentication({
      clock,
      origin: "https://numerology.test",
      sessions: sessionRepository(session),
    });
    const request = new Request("https://numerology.test/api/v1/account", {
      headers: {
        cookie: `__Host-numerology_session=${token}`,
        origin: "https://numerology.test",
        "x-csrf-token": csrf,
      },
    });
    await expect(authentication.read(request)).resolves.toMatchObject({
      csrfValid: true,
      recentAuth: true,
      session: { principalId },
    });
    await expect(
      authentication.read(
        new Request(request.url, {
          headers: { ...Object.fromEntries(request.headers), origin: "https://attacker.test" },
        }),
      ),
    ).resolves.toMatchObject({ csrfValid: false, recentAuth: true });
  });

  it("fails recent-auth policy closed for a stale session", async () => {
    const authentication = createSessionAuthentication({
      clock,
      origin: "https://numerology.test",
      sessions: sessionRepository({
        authenticatedAt: new Date(now.valueOf() - 15 * 60 * 1_000 - 1),
        csrfDigest: digest("csrf", csrf),
        principalId,
      }),
    });
    const context = await authentication.read(
      new Request("https://numerology.test/api/v1/account", {
        headers: {
          cookie: `__Host-numerology_session=${token}`,
          origin: "https://numerology.test",
          "x-csrf-token": csrf,
        },
      }),
    );
    expect(context.recentAuth).toBe(false);
    expect(context.csrfValid).toBe(true);
  });
});

describe("private-access HTTP contract", () => {
  it("returns an enumeration-safe unauthenticated account response and records denial", async () => {
    const audits: unknown[] = [];
    const handlers = createPrivateAccessHttpHandlers({
      access: emptyRepository({
        appendAudit: async (event) => {
          audits.push(event);
        },
      }),
      clock,
      origin: "https://numerology.test",
      protector: {
        lookup: async () => new Uint8Array(32),
        protect: async () => {
          throw new Error();
        },
        reveal: async () => {
          throw new Error();
        },
      },
      sessions: sessionRepository(null),
    });
    const response = await handlers.account(
      new Request("https://numerology.test/api/v1/account", {
        headers: { origin: "https://numerology.test" },
      }),
    );
    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    expect(await response.json()).toMatchObject({ code: "UNAUTHENTICATED", status: 401 });
    expect(audits).toHaveLength(1);
  });

  it("returns an accepted lifecycle receipt with a durable-idempotency-shaped contract", async () => {
    const key = "0199a72d-3f45-7df1-a730-1722c2538a32";
    const receipt = {
      action: "export" as const,
      id: "0199a72d-3f45-7df1-a730-1722c2538a33",
      requestedAt: now,
      status: "requested" as const,
    };
    const handlers = createPrivateAccessHttpHandlers({
      access: emptyRepository({ createLifecycleRequest: async () => receipt }),
      clock,
      origin: "https://numerology.test",
      protector: {
        lookup: async () => new Uint8Array(32),
        protect: async () => {
          throw new Error();
        },
        reveal: async () => {
          throw new Error();
        },
      },
      sessions: sessionRepository({
        authenticatedAt: now,
        csrfDigest: digest("csrf", csrf),
        principalId,
      }),
    });
    const response = await handlers.lifecycle(
      new Request("https://numerology.test/api/v1/reports/1/requests", {
        body: JSON.stringify({ action: "export" }),
        headers: {
          "content-type": "application/json",
          cookie: `__Host-numerology_session=${token}`,
          "idempotency-key": key,
          origin: "https://numerology.test",
          "x-csrf-token": csrf,
        },
        method: "POST",
      }),
      reportId,
    );
    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({
      action: "export",
      id: receipt.id,
      requestedAt: now.toISOString(),
      status: "requested",
    });
  });

  it("revokes all sessions with a null-body response and clears private cookies", async () => {
    let revoked = false;
    const handlers = createPrivateAccessHttpHandlers({
      access: emptyRepository({
        revokeAllSessions: async () => {
          revoked = true;
          return 2;
        },
      }),
      clock,
      origin: "https://numerology.test",
      protector: {
        lookup: async () => new Uint8Array(32),
        protect: async () => {
          throw new Error();
        },
        reveal: async () => {
          throw new Error();
        },
      },
      sessions: sessionRepository({
        authenticatedAt: now,
        csrfDigest: digest("csrf", csrf),
        principalId,
      }),
    });
    const response = await handlers.revokeAll(
      new Request("https://numerology.test/api/v1/auth/revoke-all", {
        headers: {
          cookie: `__Host-numerology_session=${token}`,
          origin: "https://numerology.test",
          "x-csrf-token": csrf,
        },
        method: "POST",
      }),
    );
    expect(response.status).toBe(204);
    expect(await response.text()).toBe("");
    expect(response.headers.get("set-cookie")).toContain("__Host-numerology_session=");
    expect(response.headers.get("set-cookie")).toContain("__Host-numerology_csrf=");
    expect(response.headers.get("set-cookie")).toContain("report_draft=");
    expect(revoked).toBe(true);
  });
});
