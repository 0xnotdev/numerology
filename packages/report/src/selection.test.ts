import { parseActionId, parseRuleId } from "@numerology/doctrine";
import { describe, expect, it } from "vitest";
import type { ClaimCandidate } from "./candidate";
import { assertResolvedEvidenceBoundary } from "./evidence";
import { balanceClaimValence, enforceThemeClaimCap } from "./ranking";
import { selectClaims } from "./selection";
import { buildClaimCandidates } from "./ranking";
import { buildIntegrationFixture } from "./test-support";

function candidateFixture(): ClaimCandidate {
  const fixture = buildIntegrationFixture();
  const context = assertResolvedEvidenceBoundary(fixture.bundle, fixture.evidence);
  const candidate = buildClaimCandidates(fixture.evidence.evidence, context.factsById)[0];
  if (candidate === undefined) {
    throw new Error("Missing selection candidate.");
  }
  return candidate;
}

function candidate(
  base: ClaimCandidate,
  id: string,
  overrides: Partial<ClaimCandidate> = {},
): ClaimCandidate {
  return {
    ...base,
    claimId: id,
    ruleIds: [parseRuleId(`RULE_${id.toUpperCase().replaceAll("-", "_")}`)],
    score: 100 - id.length,
    sectionKey: "growth_edges",
    themeId: id,
    ...overrides,
  };
}

const POLICY = {
  maxActions: 5,
  maxClaimsPerTheme: 10,
  maxRootWordShare: 1,
  maxTimingWordShare: 1,
  minimumIndependentProfileFamilies: 0,
} as const;

describe("claim selection", () => {
  it("keeps the exact maxClaimsPerTheme boundary after total ranking", () => {
    const base = candidateFixture();
    const values = [
      candidate(base, "third", { score: 1, themeId: "shared" }),
      candidate(base, "first", { score: 3, themeId: "shared" }),
      candidate(base, "second", { score: 2, themeId: "shared" }),
    ];

    expect(enforceThemeClaimCap(values, 0)).toEqual([]);
    expect(enforceThemeClaimCap(values, 2).map((item) => item.claimId)).toEqual([
      "first",
      "second",
    ]);
    expect(enforceThemeClaimCap(values, 3).map((item) => item.claimId)).toEqual([
      "first",
      "second",
      "third",
    ]);
  });

  it("fills a section to its exact boundary and rejects deterministic overflow", () => {
    const base = candidateFixture();
    const values = Array.from({ length: 7 }, (_, index) =>
      candidate(base, `section-${index}`, {
        score: 100 - index,
        sectionKey: "growth_edges",
        wordBudget: 80,
      }),
    );
    const selected = selectClaims(values, [], POLICY);

    expect(selected.map((item) => item.claimId)).toEqual([
      "section-0",
      "section-1",
      "section-2",
      "section-3",
      "section-4",
      "section-5",
    ]);
    expect(selected.reduce((total, item) => total + item.wordBudget, 0)).toBe(480);
  });

  it("accounts for mandatory section words before selecting optional claims", () => {
    const base = candidateFixture();
    const mandatory = candidate(base, "mandatory", {
      mandatory: true,
      sectionKey: "growth_edges",
      wordBudget: 400,
    });
    const fits = candidate(base, "fits", {
      sectionKey: "growth_edges",
      wordBudget: 80,
    });
    const overflows = candidate(base, "overflows", {
      sectionKey: "growth_edges",
      wordBudget: 81,
    });

    expect(
      selectClaims([overflows, fits], [mandatory], POLICY).map((item) => item.claimId),
    ).toEqual(["fits", "mandatory"]);
  });

  it("preserves exact timing and root share boundaries and removes the lowest-ranked overflow", () => {
    const base = candidateFixture();
    const timing = candidate(base, "timing", { score: 20, timing: true, wordBudget: 80 });
    const timeless = candidate(base, "timeless", {
      primaryRoot: null,
      score: 10,
      timing: false,
      wordBudget: 80,
    });
    expect(
      selectClaims([timing, timeless], [], { ...POLICY, maxTimingWordShare: 0.5 }).map(
        (item) => item.claimId,
      ),
    ).toEqual(["timing", "timeless"]);
    expect(
      selectClaims([timing, timeless], [], { ...POLICY, maxTimingWordShare: 0.49 }).map(
        (item) => item.claimId,
      ),
    ).toEqual(["timeless"]);

    const rootOne = candidate(base, "root-one", { primaryRoot: 1, score: 30 });
    const rootTwo = candidate(base, "root-two", { primaryRoot: 2, score: 20 });
    const noRoot = candidate(base, "no-root", { primaryRoot: null, score: 10 });
    expect(
      selectClaims([rootOne, rootTwo, noRoot], [], {
        ...POLICY,
        maxRootWordShare: 1 / 3,
      }).map((item) => item.claimId),
    ).toEqual(["root-one", "root-two", "no-root"]);
    expect(
      selectClaims([rootOne, rootTwo, noRoot], [], {
        ...POLICY,
        maxRootWordShare: 0.32,
      }).map((item) => item.claimId),
    ).toEqual(["no-root"]);
  });

  it("limits tension runs, resets on strengths, and reserves action capacity by branded ID", () => {
    const base = candidateFixture();
    const tension = (id: string, actionId: string) =>
      candidate(base, id, {
        actionIds: [parseActionId(actionId)],
        valence: "tension",
      });
    const strength = (id: string) => candidate(base, id, { valence: "strength" });
    const sequence = [
      tension("t1", "reflect.same"),
      tension("t2", "reflect.same"),
      tension("t3", "reflect.same"),
      strength("s1"),
      tension("t4", "reflect.same"),
    ];
    expect(balanceClaimValence(sequence).map((item) => item.claimId)).toEqual([
      "t1",
      "t2",
      "s1",
      "t4",
    ]);

    const actionSequence = [
      tension("a1", "reflect.same"),
      strength("reset"),
      tension("a2", "reflect.same"),
      strength("reset-2"),
      tension("dropped", "reflect.different"),
    ];
    expect(
      selectClaims(actionSequence, [], { ...POLICY, maxActions: 1 }).map((item) => item.claimId),
    ).not.toContain("dropped");
    expect(selectClaims(actionSequence, [], { ...POLICY, maxActions: 1 })).toHaveLength(4);
  });
});
