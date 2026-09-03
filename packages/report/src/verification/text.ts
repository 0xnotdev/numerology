import type { ReportClaimId } from "../ids";
import type { StructuredReport } from "../structured-report";

export interface ReportTextSpan {
  readonly claimId?: ReportClaimId;
  readonly path: string;
  readonly sectionId?: string;
  readonly text: string;
}

export function reportTextSpans(report: StructuredReport): readonly ReportTextSpan[] {
  const spans: ReportTextSpan[] = [
    { path: "title", text: report.title },
    { path: "displayName", text: report.displayName },
    ...report.claims.flatMap((claim, claimIndex): ReportTextSpan[] => [
      {
        claimId: claim.claimId,
        path: `claims.${claimIndex}.localized.heading`,
        text: claim.localized.heading,
      },
      ...claim.localized.body.map((text, bodyIndex) => ({
        claimId: claim.claimId,
        path: `claims.${claimIndex}.localized.body.${bodyIndex}`,
        text,
      })),
      ...(claim.localized.action === undefined
        ? []
        : [
            {
              claimId: claim.claimId,
              path: `claims.${claimIndex}.localized.action`,
              text: claim.localized.action,
            },
          ]),
    ]),
  ];
  report.sections.forEach((section, sectionIndex) => {
    spans.push(
      {
        path: `sections.${sectionIndex}.title`,
        sectionId: section.sectionId,
        text: section.title,
      },
      ...(section.dek === undefined
        ? []
        : [
            {
              path: `sections.${sectionIndex}.dek`,
              sectionId: section.sectionId,
              text: section.dek,
            },
          ]),
    );
    section.blocks.forEach((block, blockIndex) => {
      const path = `sections.${sectionIndex}.blocks.${blockIndex}`;
      switch (block.type) {
        case "prose":
          block.paragraphs.forEach((text, paragraphIndex) => {
            const provenance = block.sentenceProvenance[paragraphIndex];
            spans.push({
              ...(provenance?.claimId === undefined ? {} : { claimId: provenance.claimId }),
              path: `${path}.paragraphs.${paragraphIndex}`,
              sectionId: section.sectionId,
              text,
            });
          });
          break;
        case "number_card":
        case "lo_shu":
          spans.push({
            ...(block.captionProvenance.claimId === undefined
              ? {}
              : { claimId: block.captionProvenance.claimId }),
            path: `${path}.caption`,
            sectionId: section.sectionId,
            text: block.caption,
          });
          break;
        case "comparison":
        case "source_note":
          spans.push({
            ...(block.bodyProvenance.claimId === undefined
              ? {}
              : { claimId: block.bodyProvenance.claimId }),
            path: `${path}.body`,
            sectionId: section.sectionId,
            text: block.body,
          });
          break;
        case "timeline":
          block.items.forEach((item, itemIndex) => {
            spans.push({
              claimId: item.provenance.claimId ?? item.claimId,
              path: `${path}.items.${itemIndex}.label`,
              sectionId: section.sectionId,
              text: item.label,
            });
          });
          break;
      }
    });
  });
  return spans;
}

const NUMBER_WORDS: Readonly<Record<string, number>> = Object.freeze({
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
});

const TENS_WORDS: Readonly<Record<string, number>> = Object.freeze({
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
});

const SCALE_WORDS: Readonly<Record<string, number>> = Object.freeze({
  hundred: 100,
  thousand: 1_000,
  lakh: 100_000,
  lakhs: 100_000,
  crore: 10_000_000,
  crores: 10_000_000,
});

function numberWordValue(
  words: readonly string[],
  start: number,
): { readonly end: number; readonly value: number } | undefined {
  let index = start;
  let total = 0;
  let current = 0;
  let consumed = false;
  while (index < words.length) {
    const word = words[index];
    if (word === undefined) {
      break;
    }
    const small = NUMBER_WORDS[word];
    const tens = TENS_WORDS[word];
    if (small !== undefined) {
      current += small;
      consumed = true;
      index += 1;
      continue;
    }
    if (tens !== undefined) {
      current += tens;
      consumed = true;
      index += 1;
      continue;
    }
    const scale = SCALE_WORDS[word];
    if (scale !== undefined) {
      if (!consumed && scale >= 100_000) break;
      current = (current === 0 ? 1 : current) * scale;
      if (scale >= 1_000) {
        total += current;
        current = 0;
      }
      consumed = true;
      index += 1;
      continue;
    }
    if (word === "and" && consumed) {
      const next = words[index + 1];
      if (
        next !== undefined &&
        (NUMBER_WORDS[next] !== undefined || TENS_WORDS[next] !== undefined)
      ) {
        index += 1;
        continue;
      }
    }
    break;
  }
  return consumed ? { end: index, value: total + current } : undefined;
}

function decimalDigit(character: string): string | undefined {
  const point = character.codePointAt(0);
  if (point === undefined) {
    return undefined;
  }
  if (point >= 0x30 && point <= 0x39) {
    return String(point - 0x30);
  }
  if (point >= 0x0966 && point <= 0x096f) {
    return String(point - 0x0966);
  }
  if (point >= 0x0b66 && point <= 0x0b6f) {
    return String(point - 0x0b66);
  }
  return undefined;
}

export function numericTokens(text: string): readonly string[] {
  const tokens: string[] = [];
  for (const match of text.matchAll(/[0-9\u0966-\u096f\u0b66-\u0b6f]+/gu)) {
    const normalized = [...match[0]].map(decimalDigit).join("");
    if (normalized.length > 0) {
      tokens.push(String(Number(normalized)));
    }
  }
  for (const match of text
    .normalize("NFC")
    .toLocaleLowerCase("en-US")
    .matchAll(/([0-9]+(?:\.[0-9]+)?)\s*(lakh|lakhs|crore|crores)\b/gu)) {
    const amount = Number(match[1]);
    const multiplier = match[2]?.startsWith("crore") ? 10_000_000 : 100_000;
    if (Number.isFinite(amount)) {
      tokens.push(String(amount * multiplier));
    }
  }
  const words =
    text
      .normalize("NFC")
      .toLocaleLowerCase("en-US")
      .match(/[\p{L}]+/gu) ?? [];
  for (let index = 0; index < words.length; ) {
    const parsed = numberWordValue(words, index);
    if (parsed === undefined) {
      index += 1;
      continue;
    }
    tokens.push(String(parsed.value));
    index = parsed.end;
  }
  return tokens;
}

export function allowedNumericTokens(tokens: readonly string[]): ReadonlySet<string> {
  return new Set(tokens.flatMap(numericTokens));
}

export function normalizedWords(text: string): readonly string[] {
  return (
    text
      .normalize("NFC")
      .toLocaleLowerCase("en-US")
      .match(/[\p{L}\p{N}]+/gu) ?? []
  );
}

export function shingleSimilarity(left: string, right: string, size = 5): number {
  const shingles = (text: string): Set<string> => {
    const words = normalizedWords(text);
    const result = new Set<string>();
    for (let index = 0; index <= words.length - size; index += 1) {
      result.add(words.slice(index, index + size).join(" "));
    }
    return result;
  };
  const leftSet = shingles(left);
  const rightSet = shingles(right);
  if (leftSet.size === 0 || rightSet.size === 0) {
    return 0;
  }
  const intersection = [...leftSet].filter((item) => rightSet.has(item)).length;
  const union = new Set([...leftSet, ...rightSet]).size;
  return intersection / union;
}
