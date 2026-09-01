import { describe, expect, it } from "vitest";
import { classifyLetters, latinReadinessWarning, normalizeName, tokenizeNameUnits } from "./index";

const latinName = {
  id: "birth",
  kind: "birth_full" as const,
  value: "Jose\u0301",
};

describe("identity normalization", () => {
  it("retains NFC calculation identity without changing the raw request", () => {
    const normalized = normalizeName(latinName);

    expect(normalized.nfc).toBe("José");
    expect(normalized.calculationText).toBe("José");
    expect(normalized.script).toBe("Latn");
    expect(latinName.value).toBe("Jose\u0301");
    expect(latinReadinessWarning(normalized, "warning.1")).toBeNull();
  });

  it("normalizes only the engine spacing while retaining NFC identity text", () => {
    const normalized = normalizeName({ ...latinName, value: "  Anne   Marie " });

    expect(normalized.nfc).toBe("  Anne   Marie ");
    expect(normalized.calculationText).toBe("Anne Marie");
  });

  it("tokenizes name units without destroying identity separators", () => {
    expect(tokenizeNameUnits("Anna-Marie O'Neil")).toEqual([
      { start: 0, text: "Anna-Marie" },
      { start: 11, text: "O'Neil" },
    ]);
  });

  it("classifies Latin letters and requires occurrence-level Y input", () => {
    expect(classifyLetters("AB")).toEqual([
      { character: "A", classification: "vowel", index: 0 },
      { character: "B", classification: "consonant", index: 1 },
    ]);
    expect(classifyLetters("Y", { "0": "vowel" })).toEqual([
      { character: "Y", classification: "vowel", index: 0 },
    ]);
    expect(() => classifyLetters("Y")).toThrow(RangeError);
  });

  it("requires and retains explicit confirmation for non-Latin engine spellings", () => {
    const normalized = normalizeName({
      calculationText: "SHREYA PATNAIK",
      id: "birth",
      kind: "birth_full",
      script: "Deva",
      transliteration: {
        scheme: "customer-confirmed-latin",
        userConfirmed: true,
        version: "1",
      },
      value: "श्रेया पटनायक",
    });

    expect(normalized.calculationText).toBe("SHREYA PATNAIK");
    expect(normalized.transliteration).toEqual({
      scheme: "customer-confirmed-latin",
      userConfirmed: true,
      version: "1",
    });
    expect(latinReadinessWarning(normalized, "warning.1")).toBeNull();
  });

  it("does not treat an unconfirmed transliteration as calculable", () => {
    const normalized = normalizeName({
      calculationText: "SHREYA PATNAIK",
      id: "birth",
      kind: "birth_full",
      script: "Deva",
      transliteration: {
        scheme: "machine-suggestion",
        userConfirmed: false as true,
        version: "1",
      },
      value: "श्रेया पटनायक",
    });

    expect(latinReadinessWarning(normalized, "warning.1")).toEqual(
      expect.objectContaining({ code: "ENGINE_TRANSLITERATION_CONFIRMATION_REQUIRED" }),
    );
  });

  it("rejects malformed script, locale, and occurrence classification metadata", () => {
    expect(() => normalizeName(null as never)).toThrow(RangeError);
    expect(() => normalizeName({ ...latinName, id: " " })).toThrow(RangeError);
    expect(() => normalizeName({ ...latinName, kind: "unknown" as never })).toThrow(RangeError);
    expect(() => normalizeName({ ...latinName, value: 42 as never })).toThrow(RangeError);
    expect(() => normalizeName({ ...latinName, calculationText: 42 as never })).toThrow(RangeError);
    expect(() => normalizeName({ ...latinName, script: 42 as never })).toThrow(RangeError);
    expect(() => normalizeName({ ...latinName, locale: 42 as never })).toThrow(RangeError);
    expect(() => normalizeName({ ...latinName, yClassifications: null as never })).toThrow(
      RangeError,
    );
    expect(() => normalizeName({ ...latinName, yClassifications: [] as never })).toThrow(
      RangeError,
    );
    expect(() =>
      normalizeName({ ...latinName, yClassifications: { x: "vowel" } as never }),
    ).toThrow(RangeError);
    expect(() =>
      normalizeName({ ...latinName, yClassifications: { "1": "maybe" } as never }),
    ).toThrow(RangeError);
    expect(() =>
      normalizeName({
        ...latinName,
        transliteration: { scheme: "", userConfirmed: true, version: "1" },
      }),
    ).toThrow(RangeError);
    expect(() => normalizeName({ ...latinName, calculationText: "A<" })).toThrow(RangeError);
  });

  it("infers supported and unknown scripts from the NFC display value", () => {
    expect(normalizeName({ ...latinName, value: "श्रेया" }).script).toBe("Deva");
    expect(normalizeName({ ...latinName, value: "বাংলা" }).script).toBe("Beng");
    expect(normalizeName({ ...latinName, value: "ଓଡ଼ିଆ" }).script).toBe("Orya");
    expect(normalizeName({ ...latinName, value: "日本語" }).script).toBe("Zyyy");
    expect(normalizeName({ ...latinName, locale: "hi-IN" }).locale).toBe("hi-IN");
  });

  it("covers token and letter-classification rejection boundaries", () => {
    expect(() => tokenizeNameUnits(42 as never)).toThrow(RangeError);
    expect(tokenizeNameUnits("  Anna  ")).toEqual([{ start: 2, text: "Anna" }]);
    expect(() => classifyLetters(42 as never)).toThrow(RangeError);
    expect(classifyLetters(" A-B' . ")).toEqual([
      { character: "A", classification: "vowel", index: 1 },
      { character: "B", classification: "consonant", index: 3 },
    ]);
    expect(() => classifyLetters("é")).toThrow(RangeError);
    expect(() => classifyLetters("Y", { "0": "maybe" as never })).toThrow(RangeError);
  });

  it.each(["", "  ", "A\u202E B", "A1", "A🙂", "A".repeat(121)])(
    "rejects unsafe name text %j",
    (value) => {
      expect(() => normalizeName({ ...latinName, value })).toThrow(RangeError);
    },
  );
});
