import { createHash, randomBytes, randomUUID } from "node:crypto";
import { createMagicLinkHttpHandlers, LocalEnvelopeFieldProtector } from "@numerology/application";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDatabasePool, runMigrations } from "./index";
import { createPostgresMagicLinkRepository } from "./magic-link-repository";
import { createPostgresSessionRepository } from "./session-repository";
import { resetTestDatabase } from "./test-support";

const connectionString =
  process.env.TEST_DATABASE_URL ??
  "postgresql://numerology:numerology@127.0.0.1:5432/numerology_test";
const pool = createDatabasePool({ connectionString, max: 3 });
const protector = new LocalEnvelopeFieldProtector({
  keyEncryptionKey: Buffer.alloc(32, 0x71),
  lookupKey: Buffer.alloc(32, 0x72),
  keyId: "magic-test",
});
const start = new Date("2026-09-04T11:00:00Z");
const origin = "https://example.test";
const post = (path: string, body: unknown, cookie = "") =>
  new Request(origin + path, {
    method: "POST",
    headers: { origin, cookie, "content-type": "application/json" },
    body: JSON.stringify(body),
  });

describe("email magic-link sign-in over HTTP and PostgreSQL", () => {
  beforeAll(async () => {
    await resetTestDatabase(pool, connectionString);
    await runMigrations(pool);
  });
  afterAll(() => pool.end());

  it("issues only a verified single-use session and stores no raw credentials or email", async () => {
    const messages: { email: string; url: string }[] = [];
    const handlers = createMagicLinkHttpHandlers({
      origin,
      clock: { now: () => start },
      protector,
      repository: createPostgresMagicLinkRepository(pool),
      sender: {
        send: async (message) => {
          messages.push(message);
        },
      },
      requestBudget: { consume: async () => true },
    });
    const requested = await handlers.requestLink(
      post("/api/v1/auth/magic-link", { email: "Alice@Example.invalid", locale: "en-IN" }),
    );
    expect(requested.status).toBe(202);
    expect(await requested.json()).toEqual({
      message: "If delivery is available, a sign-in link will arrive shortly.",
    });
    expect(messages).toHaveLength(1);
    const sent = messages[0];
    if (!sent) throw new Error("Expected test mail");
    expect(sent.email).toBe("alice@example.invalid");
    const token = new URL(sent.url).hash.slice(1);
    expect(new URL(sent.url).search).toBe("");
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/u);
    const browserCookie = requested.headers.getSetCookie()[0]?.split(";")[0] ?? "";
    expect(browserCookie).toMatch(/^__Host-numerology_login=/u);
    expect(
      (await handlers.consumeLink(post("/api/v1/auth/magic-link/consume", { token }))).status,
    ).toBe(401);
    expect((await handlers.consumeLink(new Request(sent.url))).status).toBe(405);
    const consumed = await handlers.consumeLink(
      post("/api/v1/auth/magic-link/consume", { token }, browserCookie),
    );
    expect(consumed.status).toBe(200);
    expect(await consumed.json()).toEqual({ authenticated: true });
    const cookies = consumed.headers.getSetCookie();
    const sessionCookie = cookies.find((cookie) => cookie.startsWith("__Host-numerology_session="));
    const sessionToken = sessionCookie?.split(";")[0]?.split("=")[1] ?? "";
    expect(sessionCookie).toContain("HttpOnly; Secure; SameSite=Lax");
    expect(cookies.find((cookie) => cookie.startsWith("__Host-numerology_csrf="))).toContain(
      "Secure; SameSite=Strict",
    );
    const session = await createPostgresSessionRepository(pool).findActive(
      createHash("sha256").update(`numerology:session:v1:${sessionToken}`).digest(),
      start,
    );
    expect(session?.principalId).toBeTruthy();
    expect(
      (
        await handlers.consumeLink(
          post("/api/v1/auth/magic-link/consume", { token }, browserCookie),
        )
      ).status,
    ).toBe(401);
    const storage = await pool.query<{ email_ciphertext: Buffer }>(
      "SELECT email_ciphertext FROM principals",
    );
    expect(storage.rows).toHaveLength(1);
    expect(storage.rows[0]?.email_ciphertext.includes(Buffer.from(sent.email))).toBe(false);
    const challenges = await pool.query<{
      token_digest: Buffer;
      pending_email_ciphertext: Buffer | null;
    }>("SELECT token_digest, pending_email_ciphertext FROM access_challenges");
    expect(challenges.rows[0]?.token_digest.includes(Buffer.from(token))).toBe(false);
    expect(challenges.rows[0]?.pending_email_ciphertext).toBeNull();
  });

  it("rejects expired links, concurrent replay and wrong origin; throttles sends durably", async () => {
    let now = start;
    const messages: { email: string; url: string }[] = [];
    const make = () =>
      createMagicLinkHttpHandlers({
        origin,
        clock: { now: () => now },
        protector,
        repository: createPostgresMagicLinkRepository(pool),
        sender: {
          send: async (message) => {
            messages.push(message);
          },
        },
        requestBudget: { consume: async () => true },
      });
    const request = () =>
      post("/api/v1/auth/magic-link", { email: "rate@example.invalid", locale: "en-IN" });
    const issued = await make().requestLink(request());
    const cookie = issued.headers.getSetCookie()[0]?.split(";")[0] ?? "";
    await make().requestLink(request());
    expect(messages).toHaveLength(1);
    const token = new URL(messages[0]?.url ?? "").hash.slice(1);
    const wrongOrigin = post("/api/v1/auth/magic-link/consume", { token }, cookie);
    wrongOrigin.headers.set("origin", "https://attacker.invalid");
    expect((await make().consumeLink(wrongOrigin)).status).toBe(403);
    now = new Date(start.valueOf() + 600000);
    expect(
      (await make().consumeLink(post("/api/v1/auth/magic-link/consume", { token }, cookie))).status,
    ).toBe(401);
    const fresh = await make().requestLink(request());
    const freshCookie = fresh.headers.getSetCookie()[0]?.split(";")[0] ?? "";
    const freshToken = new URL(messages[1]?.url ?? "").hash.slice(1);
    const responses = await Promise.all([
      make().consumeLink(
        post("/api/v1/auth/magic-link/consume", { token: freshToken }, freshCookie),
      ),
      make().consumeLink(
        post("/api/v1/auth/magic-link/consume", { token: freshToken }, freshCookie),
      ),
    ]);
    expect(responses.map((result) => result.status).sort()).toEqual([200, 401]);
  });

  it("fails closed on email delivery and abuse-budget failure without exposing private errors", async () => {
    let attemptedUrl = "";
    const repository = createPostgresMagicLinkRepository(pool);
    const handlers = createMagicLinkHttpHandlers({
      origin,
      clock: { now: () => start },
      protector,
      repository,
      sender: {
        send: async ({ url }) => {
          attemptedUrl = url;
          throw new Error("private@example.invalid mail secret");
        },
      },
      requestBudget: { consume: async () => true },
    });
    const result = await handlers.requestLink(
      post("/api/v1/auth/magic-link", { email: "failure@example.invalid", locale: "en-IN" }),
    );
    expect(result.status).toBe(503);
    expect(await result.json()).toEqual({ code: "SIGN_IN_UNAVAILABLE" });
    expect(result.headers.getSetCookie()).toEqual([]);
    const token = new URL(attemptedUrl).hash.slice(1);
    const stored = await pool.query<{
      consumed_at: Date | null;
      pending_email_ciphertext: Buffer | null;
    }>(
      "SELECT consumed_at, pending_email_ciphertext FROM access_challenges WHERE token_digest = $1",
      [createHash("sha256").update(`numerology:magic-link:v1:${token}`).digest()],
    );
    expect(stored.rows[0]?.consumed_at).toEqual(start);
    expect(stored.rows[0]?.pending_email_ciphertext).toBeNull();
    const denied = createMagicLinkHttpHandlers({
      origin,
      clock: { now: () => start },
      protector,
      repository,
      sender: {
        send: async () => {
          throw new Error("must not send");
        },
      },
      requestBudget: { consume: async () => false },
    });
    expect(
      (
        await denied.requestLink(
          post("/api/v1/auth/magic-link", { email: "other@example.invalid", locale: "en-IN" }),
        )
      ).status,
    ).toBe(429);
    const oversized = post("/api/v1/auth/magic-link", { email: "a".repeat(5000), locale: "en-IN" });
    expect((await handlers.requestLink(oversized)).status).toBe(400);
  });

  it("erases expired pending emails and retains only one principal across repeat sign-in", async () => {
    let now = new Date(start.valueOf() + 3600000);
    const messages: { email: string; url: string }[] = [];
    const repository = createPostgresMagicLinkRepository(pool);
    const handlers = createMagicLinkHttpHandlers({
      origin,
      clock: { now: () => now },
      protector,
      repository,
      sender: {
        send: async (message) => {
          messages.push(message);
        },
      },
      requestBudget: { consume: async () => true },
    });
    const signIn = async () => {
      const result = await handlers.requestLink(
        post("/api/v1/auth/magic-link", { email: "alice@example.invalid", locale: "en-IN" }),
      );
      const cookie = result.headers.getSetCookie()[0]?.split(";")[0] ?? "";
      const token = new URL(messages.at(-1)?.url ?? "").hash.slice(1);
      return handlers.consumeLink(post("/api/v1/auth/magic-link/consume", { token }, cookie));
    };
    expect((await signIn()).status).toBe(200);
    const lookup = await protector.lookup("alice@example.invalid", "principal_email");
    expect(
      (
        await pool.query<{ count: string }>(
          "SELECT count(*) FROM principals WHERE email_lookup_hmac = $1",
          [Buffer.from(lookup)],
        )
      ).rows[0]?.count,
    ).toBe("1");
    await handlers.requestLink(
      post("/api/v1/auth/magic-link", { email: "expired-email@example.invalid", locale: "en-IN" }),
    );
    now = new Date(now.valueOf() + 600000);
    expect(await repository.purgeExpired(now, 100)).toBeGreaterThan(0);
    const pending = await pool.query<{ count: string }>(
      "SELECT count(*) FROM access_challenges WHERE purpose = 'sign_in' AND expires_at <= $1 AND pending_email_ciphertext IS NOT NULL",
      [now],
    );
    expect(pending.rows[0]?.count).toBe("0");
  });

  it("rolls back principal creation and token consumption when session issuance fails", async () => {
    let url = "";
    const repository = createPostgresMagicLinkRepository(pool);
    const handlers = createMagicLinkHttpHandlers({
      origin,
      clock: { now: () => start },
      protector,
      repository,
      sender: {
        send: async (message) => {
          url = message.url;
        },
      },
      requestBudget: { consume: async () => true },
    });
    const result = await handlers.requestLink(
      post("/api/v1/auth/magic-link", { email: "rollback@example.invalid", locale: "en-IN" }),
    );
    const browser = result.headers.getSetCookie()[0]?.split(";")[0]?.split("=")[1] ?? "";
    const token = new URL(url).hash.slice(1);
    const sessionId = randomUUID();
    const input = {
      tokenDigest: createHash("sha256").update(`numerology:magic-link:v1:${token}`).digest(),
      browserDigest: createHash("sha256").update(`numerology:login-browser:v1:${browser}`).digest(),
      now: start,
      principalId: randomUUID(),
      sessionId,
      sessionDigest: randomBytes(32),
      csrfDigest: randomBytes(32),
      expiresAt: new Date(start.valueOf() + 86400000),
    };
    // Invalid UUID forces the session insert to fail after principal creation, exercising rollback.
    await expect(repository.consume({ ...input, sessionId: "invalid" })).rejects.toThrow();
    const lookup = await protector.lookup("rollback@example.invalid", "principal_email");
    const account = await pool.query<{ count: string }>(
      "SELECT count(*) FROM principals WHERE email_lookup_hmac = $1",
      [Buffer.from(lookup)],
    );
    expect(account.rows[0]?.count).toBe("0");
    await expect(repository.consume(input)).resolves.toBe(true);
    await expect(repository.consume({ ...input, sessionId: randomUUID() })).resolves.toBe(false);
  });
});
