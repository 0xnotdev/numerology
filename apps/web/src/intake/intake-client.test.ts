import { describe, expect, it, vi } from "vitest";
import { createIntakeClient, draftToValues, valuesToPatch } from "./intake-client";

const id = "00000000-0000-4000-8000-000000000003";
function saved(version = 1, status = "draft") {
  return {
    draft: { locale: "en-IN", schemaVersion: "1.0.0" },
    intent: {
      id,
      version,
      status,
      locale: "en-IN",
      expiresAt: "2026-09-11T00:00:00Z",
      updatedAt: "2026-09-04T00:00:00Z",
    },
  };
}
describe("connected intake transport", () => {
  it("retains a create key after an uncertain failure and carries version/CSRF across save and complete", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new TypeError("network"))
      .mockResolvedValueOnce(Response.json(saved()))
      .mockResolvedValueOnce(Response.json(saved(2)))
      .mockResolvedValueOnce(Response.json(saved(3, "complete")));
    const client = createIntakeClient({
      fetch: fetcher,
      csrf: () => "a".repeat(43),
      key: () => id,
    });
    await expect(
      client.save("en-IN", { subject: { names: [{ kind: "birth_full", value: "Riya" }] } }),
    ).rejects.toThrow();
    await client.save("en-IN", { subject: { names: [{ kind: "birth_full", value: "Riya" }] } });
    expect(new Headers(fetcher.mock.calls[0]?.[1]?.headers).get("Idempotency-Key")).toBe(
      new Headers(fetcher.mock.calls[1]?.[1]?.headers).get("Idempotency-Key"),
    );
    expect(JSON.parse(String(fetcher.mock.calls[2]?.[1]?.body)).expectedVersion).toBe(1);
    await client.complete({});
    expect(JSON.parse(String(fetcher.mock.calls[3]?.[1]?.body)).expectedVersion).toBe(2);
    expect(new Headers(fetcher.mock.calls[3]?.[1]?.headers).get("X-CSRF-Token")).toBe(
      "a".repeat(43),
    );
    expect(
      fetcher.mock.calls.every(
        (call) => call[1]?.cache === "no-store" && call[1]?.credentials === "same-origin",
      ),
    ).toBe(true);
  });
  it("does not overwrite a conflict or leak a server error body", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json(saved()))
      .mockResolvedValueOnce(
        Response.json(
          { code: "INTENT_VERSION_CONFLICT", detail: "private canary" },
          { status: 409 },
        ),
      );
    const client = createIntakeClient({
      fetch: fetcher,
      csrf: () => "a".repeat(43),
      key: () => id,
    });
    await expect(client.save("en-IN", {})).rejects.toThrow("saved in another tab");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("resumes only through the authenticated endpoint and rejects malformed projections", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json(saved()))
      .mockResolvedValueOnce(
        Response.json({ locale: "en-IN", values: [{ label: "Life path", value: "7" }] }),
      );
    const client = createIntakeClient({
      fetch: fetcher,
      csrf: () => "a".repeat(43),
      key: () => id,
    });
    expect((await client.load(id)).intent.id).toBe(id);
    expect(fetcher.mock.calls[0]?.[0]).toBe(`/api/v1/report-intents/${id}`);
    await expect(client.preview()).rejects.toThrow("unexpected response");
  });
  it("round-trips independent name policies without PII browser storage", () => {
    const patch = valuesToPatch(
      {
        birthName: " Yara ",
        currentName: "Yuri",
        birthNameYClassifications: { "0": "consonant" },
        currentNameYClassifications: { "0": "vowel" },
        dateOfBirth: "1990-08-12",
        email: "person@example.invalid",
        consent: true,
      },
      "en-IN",
    );
    expect(patch.subject?.names?.[0]?.yClassifications).toEqual({ "0": "consonant" });
    expect(patch.subject?.names?.[1]?.yClassifications).toEqual({ "0": "vowel" });
    const values = draftToValues({ ...patch, locale: "en-IN", schemaVersion: "1.0.0" });
    expect(values.currentNameYClassifications).toEqual({ "0": "vowel" });
    expect(values.consent).toBe(true);
  });
});
