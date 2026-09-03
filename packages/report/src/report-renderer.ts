import { type CalculatedFact, type FactId, parseCalculationBundle } from "@numerology/engine";
import { parseStructuredReport, type ReportBlock } from "./structured-report";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function factValue(fact: CalculatedFact | undefined): string {
  return fact === undefined || fact.displayTokens.length === 0
    ? "Not displayed"
    : fact.displayTokens.join(" · ");
}

function renderLoShuGrid(fact: CalculatedFact | undefined): string {
  const order = [4, 9, 2, 3, 5, 7, 8, 1, 6];
  const occurrences = fact?.occurrences ?? {};
  const rows = [0, 3, 6]
    .map(
      (start) =>
        `<tr>${order
          .slice(start, start + 3)
          .map(
            (digit) =>
              `<td><span class="grid-digit">${digit}</span><span class="grid-count">Count ${occurrences[String(digit)] ?? 0}</span></td>`,
          )
          .join("")}</tr>`,
    )
    .join("");
  return `<table class="lo-shu-table"><caption>Lo Shu digit occurrence table</caption><tbody>${rows}</tbody></table>`;
}

function renderBlock(block: ReportBlock, facts: ReadonlyMap<FactId, CalculatedFact>): string {
  switch (block.type) {
    case "prose":
      return `<div class="prose-block">${block.paragraphs.map((text) => `<p>${escapeHtml(text)}</p>`).join("")}</div>`;
    case "number_card": {
      const fact = facts.get(block.factId);
      return `<figure class="number-card"><div class="number-value">${escapeHtml(factValue(fact))}</div><figcaption>${escapeHtml(block.caption)}</figcaption></figure>`;
    }
    case "comparison": {
      const left = facts.get(block.leftFactId);
      const right = facts.get(block.rightFactId);
      return `<figure class="comparison-block"><div><strong>${escapeHtml(left?.profileId ?? "Unknown profile")}</strong><span>${escapeHtml(factValue(left))}</span></div><div><strong>${escapeHtml(right?.profileId ?? "Unknown profile")}</strong><span>${escapeHtml(factValue(right))}</span></div><figcaption>${escapeHtml(block.body)}</figcaption></figure>`;
    }
    case "lo_shu":
      return `<figure class="grid-block">${renderLoShuGrid(facts.get(block.gridFactId))}<figcaption>${escapeHtml(block.caption)}</figcaption></figure>`;
    case "timeline":
      return `<ol class="timeline">${block.items.map((item) => `<li><span>${escapeHtml(item.label)}</span><strong>${escapeHtml(factValue(facts.get(item.factId)))}</strong><a href="#${escapeHtml(item.claimId)}">Read linked finding</a></li>`).join("")}</ol>`;
    case "source_note":
      return `<aside class="source-note"><p>${escapeHtml(block.body)}</p><p>Sources: ${block.sourceRefs.map(escapeHtml).join(", ")}</p></aside>`;
  }
}

export const READER_STYLES = `
:root{color-scheme:light;--ink:#20201d;--paper:#f7f2e8;--accent:#8b4b35;--line:#d8cbbb}
*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font-family:Georgia,serif;line-height:1.65}
a{color:var(--accent)}a:focus-visible{outline:3px solid #d79a36;outline-offset:3px}.skip-link{position:fixed;left:1rem;top:1rem;transform:translateY(-180%);padding:.75rem 1rem;background:var(--ink);color:var(--paper);z-index:10}.skip-link:focus{transform:translateY(0)}.report-shell{display:grid;grid-template-columns:minmax(14rem,20rem) minmax(0,48rem);gap:3rem;max-width:76rem;margin:auto;padding:2rem}
.report-nav{position:sticky;top:1rem;align-self:start;max-height:calc(100vh - 2rem);overflow:auto}.report-nav ol{padding-left:1.3rem}.report-nav a{text-decoration:none}.claim-anchor{scroll-margin-top:1rem}
.report-cover,.report-section{padding:clamp(1.25rem,4vw,3rem);background:#fff;border:1px solid var(--line);border-radius:1.25rem;margin-bottom:1.5rem}.eyebrow{text-transform:uppercase;letter-spacing:.14em;font-size:.75rem}.dek{font-size:1.1rem;color:#58544d}
.number-card,.comparison-block,.grid-block,.source-note{border:1px solid var(--line);border-radius:1rem;padding:1rem;margin:1rem 0}.number-value{font-size:2.4rem;color:var(--accent)}.comparison-block{display:grid;grid-template-columns:1fr 1fr;gap:1rem}.comparison-block div{display:flex;flex-direction:column}.comparison-block figcaption{grid-column:1/-1}.lo-shu-table{border-collapse:collapse;margin:auto}.lo-shu-table td{border:1px solid var(--line);width:6rem;height:6rem;text-align:center}.grid-digit{display:block;font-size:1.7rem}.grid-count{font-size:.8rem}.timeline{display:grid;grid-template-columns:repeat(3,1fr);gap:.75rem}.timeline li{display:flex;flex-direction:column;border-left:3px solid var(--accent);padding:.5rem}.source-note{background:#f4ede2}.report-meta{overflow-wrap:anywhere}
@media(max-width:760px){.report-shell{display:block;padding:.75rem}.report-nav{position:static;max-height:none;margin-bottom:1rem}.comparison-block,.timeline{grid-template-columns:1fr}.report-cover,.report-section{border-radius:.75rem;padding:1.15rem}.lo-shu-table td{width:5rem;height:5rem}}
@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto}}
`;

/** Deterministic, escaped, semantic reviewer/fixture renderer. */
export function renderStructuredReportHtml(reportInput: unknown, bundleInput: unknown): string {
  const report = parseStructuredReport(reportInput);
  const bundle = parseCalculationBundle(bundleInput);
  const facts = new Map(bundle.facts.map((fact) => [fact.factId, fact]));
  const navigation = report.sections
    .map(
      (section) =>
        `<li><a href="#${escapeHtml(section.sectionId)}">${escapeHtml(section.title)}</a></li>`,
    )
    .join("");
  const sections = report.sections
    .map(
      (section) =>
        `<section class="report-section" id="${escapeHtml(section.sectionId)}" aria-labelledby="${escapeHtml(section.sectionId)}-title">${section.claimIds.map((claimId) => `<span class="claim-anchor" id="${escapeHtml(claimId)}" aria-hidden="true"></span>`).join("")}<p class="eyebrow">Section ${section.order}</p><h2 id="${escapeHtml(section.sectionId)}-title">${escapeHtml(section.title)}</h2>${section.dek === undefined ? "" : `<p class="dek">${escapeHtml(section.dek)}</p>`}${section.blocks.map((block) => renderBlock(block, facts)).join("")}</section>`,
    )
    .join("");
  return `<!doctype html><html lang="${escapeHtml(report.locale)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${escapeHtml(report.title)}</title><style>${READER_STYLES}</style></head><body><a class="skip-link" href="#report-content">Skip to report</a><main class="report-shell"><nav class="report-nav" aria-label="Report sections"><p class="eyebrow">Reading map</p><ol>${navigation}</ol></nav><article id="report-content"><header class="report-cover"><p class="eyebrow">Private synthetic fixture</p><h1>${escapeHtml(report.title)}</h1><p>${escapeHtml(report.displayName)}</p><p class="report-meta">Report ${escapeHtml(report.reportId)} · version ${report.reportVersion}</p></header>${sections}<footer class="report-section report-meta"><p>Report hash: ${escapeHtml(report.reportHash)}</p><p>Engine ${escapeHtml(report.versions.engine)} · doctrine ${escapeHtml(report.versions.doctrine)} · planner ${escapeHtml(report.versions.planner)}</p></footer></article></main></body></html>`;
}
