import type { CalculatedFact, FactId } from "@numerology/engine";
import type {
  CheckpointFourReportFixture,
  ReportBlock,
  StructuredReport,
} from "@numerology/report";

function displayValue(fact: CalculatedFact | undefined): string {
  return fact === undefined || fact.displayTokens.length === 0
    ? "Not displayed"
    : fact.displayTokens.join(" · ");
}

function LoShuTable({ fact }: Readonly<{ fact: CalculatedFact | undefined }>) {
  const order = [4, 9, 2, 3, 5, 7, 8, 1, 6] as const;
  const occurrences = fact?.occurrences ?? {};
  return (
    <table className="readerLoShuTable">
      <caption>Lo Shu digit occurrence table</caption>
      <tbody>
        {[0, 3, 6].map((start) => (
          <tr key={start}>
            {order.slice(start, start + 3).map((digit) => (
              <td key={digit}>
                <span className="readerGridDigit">{digit}</span>
                <span className="readerGridCount">Count {occurrences[String(digit)] ?? 0}</span>
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ReportBlockView({
  block,
  facts,
}: Readonly<{
  block: ReportBlock;
  facts: ReadonlyMap<FactId, CalculatedFact>;
}>) {
  switch (block.type) {
    case "prose":
      return (
        <div className="readerProse">
          {block.paragraphs.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </div>
      );
    case "number_card":
      return (
        <figure className="readerBlock readerNumberCard">
          <div className="readerNumberValue">{displayValue(facts.get(block.factId))}</div>
          <figcaption>{block.caption}</figcaption>
        </figure>
      );
    case "comparison": {
      const left = facts.get(block.leftFactId);
      const right = facts.get(block.rightFactId);
      return (
        <figure className="readerBlock readerComparison">
          <div>
            <strong>{left?.profileId ?? "Unknown profile"}</strong>
            <span>{displayValue(left)}</span>
          </div>
          <div>
            <strong>{right?.profileId ?? "Unknown profile"}</strong>
            <span>{displayValue(right)}</span>
          </div>
          <figcaption>{block.body}</figcaption>
        </figure>
      );
    }
    case "lo_shu":
      return (
        <figure className="readerBlock">
          <LoShuTable fact={facts.get(block.gridFactId)} />
          <figcaption>{block.caption}</figcaption>
        </figure>
      );
    case "timeline":
      return (
        <ol className="readerTimeline">
          {block.items.map((item) => (
            <li key={`${item.label}:${item.claimId}:${item.factId}`}>
              <span>{item.label}</span>
              <strong>{displayValue(facts.get(item.factId))}</strong>
              <a href={`#${item.claimId}`}>Read linked finding</a>
            </li>
          ))}
        </ol>
      );
    case "source_note":
      return (
        <aside className="readerBlock readerSourceNote">
          <p>{block.body}</p>
          <p>Sources: {block.sourceRefs.join(", ")}</p>
        </aside>
      );
  }
}

function blockKey(block: ReportBlock): string {
  switch (block.type) {
    case "prose":
      return `prose:${block.paragraphs[0] ?? ""}`;
    case "number_card":
      return `number_card:${block.factId}`;
    case "comparison":
      return `comparison:${block.leftFactId}:${block.rightFactId}`;
    case "lo_shu":
      return `lo_shu:${block.gridFactId}`;
    case "timeline":
      return `timeline:${block.items[0]?.factId ?? ""}`;
    case "source_note":
      return `source_note:${block.body}`;
  }
}

function ReportSections({
  facts,
  report,
}: Readonly<{
  facts: ReadonlyMap<FactId, CalculatedFact>;
  report: StructuredReport;
}>) {
  return report.sections.map((section) => (
    <section
      className="readerSection"
      id={section.sectionId}
      aria-labelledby={`${section.sectionId}-title`}
      key={section.sectionId}
    >
      {section.claimIds.map((claimId) => (
        <span className="readerClaimAnchor" id={claimId} key={claimId} aria-hidden="true" />
      ))}
      <p className="readerEyebrow">Section {section.order}</p>
      <h2 id={`${section.sectionId}-title`}>{section.title}</h2>
      {section.dek === undefined ? null : <p className="readerDek">{section.dek}</p>}
      {section.blocks.map((block) => (
        <ReportBlockView block={block} facts={facts} key={blockKey(block)} />
      ))}
    </section>
  ));
}

export function SyntheticReportReader({
  fixture,
}: Readonly<{ fixture: CheckpointFourReportFixture }>) {
  const { bundle, report, verification } = fixture;
  const facts = new Map(bundle.facts.map((fact) => [fact.factId, fact]));
  return (
    <>
      <a className="readerSkipLink" href="#report-content">
        Skip to report
      </a>
      <main className="readerShell">
        <nav className="readerNav" aria-label="Report sections">
          <p className="readerEyebrow">Reading map</p>
          <ol>
            {report.sections.map((section) => (
              <li key={section.sectionId}>
                <a href={`#${section.sectionId}`}>{section.title}</a>
              </li>
            ))}
          </ol>
        </nav>
        <article id="report-content">
          <header className="readerCover">
            <p className="readerEyebrow">Checkpoint 4 · private synthetic fixture</p>
            <h1>{report.title}</h1>
            <p className="readerDisplayName">{report.displayName}</p>
            <p className="readerMeta">
              Report {report.reportId} · version {report.reportVersion}
            </p>
            <p className="readerVerification" role="status">
              {verification.valid ? "Verified by all 12 report gates" : "Verification failed"}
            </p>
          </header>
          <ReportSections facts={facts} report={report} />
          <footer className="readerSection readerMeta">
            <p>Report hash: {report.reportHash}</p>
            <p>
              Engine {report.versions.engine} · doctrine {report.versions.doctrine} · planner{" "}
              {report.versions.planner}
            </p>
            <p>This synthetic fixture is unavailable when APP_ENV is production.</p>
          </footer>
        </article>
      </main>
    </>
  );
}
