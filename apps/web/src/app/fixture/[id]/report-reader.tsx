import type {
  CheckpointFourReportFixture,
  CustomerDeliveryBlock,
  CustomerDeliveryProjection,
} from "@numerology/report";
import { projectCustomerDelivery } from "@numerology/report";

function LoShuTable({
  block,
}: Readonly<{ block: Extract<CustomerDeliveryBlock, { type: "lo_shu" }> }>) {
  return (
    <table className="readerLoShuTable">
      <caption>Lo Shu digit occurrence table</caption>
      <tbody>
        {[0, 3, 6].map((start) => (
          <tr key={start}>
            {block.grid.slice(start, start + 3).map((cell) => (
              <td key={cell.digit}>
                <span className="readerGridDigit">{cell.digit}</span>
                <span className="readerGridCount">Count {cell.count}</span>
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ReportBlockView({ block }: Readonly<{ block: CustomerDeliveryBlock }>) {
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
          <div className="readerNumberValue">{block.value}</div>
          <figcaption>{block.caption}</figcaption>
        </figure>
      );
    case "comparison":
      return (
        <figure className="readerBlock readerComparison">
          <div>
            <strong>{block.left.label}</strong>
            <span>{block.left.value}</span>
          </div>
          <div>
            <strong>{block.right.label}</strong>
            <span>{block.right.value}</span>
          </div>
          <figcaption>{block.body}</figcaption>
        </figure>
      );
    case "lo_shu":
      return (
        <figure className="readerBlock">
          <LoShuTable block={block} />
          <figcaption>{block.caption}</figcaption>
        </figure>
      );
    case "timeline":
      return (
        <ol className="readerTimeline">
          {block.items.map((item) => (
            <li key={`${item.label}:${item.value}`}>
              <span>{item.label}</span>
              <strong>{item.value}</strong>
            </li>
          ))}
        </ol>
      );
    case "source_note":
      return (
        <aside className="readerBlock readerSourceNote">
          <p>{block.body}</p>
        </aside>
      );
  }
}

function ReportSections({ report }: Readonly<{ report: CustomerDeliveryProjection }>) {
  return report.sections.map((section) => (
    <section
      className="readerSection"
      id={`customer-section-${section.order}`}
      aria-labelledby={`customer-section-${section.order}-title`}
      key={section.order}
    >
      <p className="readerEyebrow">Section {section.order}</p>
      <h2 id={`customer-section-${section.order}-title`}>{section.title}</h2>
      {section.dek === undefined ? null : <p className="readerDek">{section.dek}</p>}
      {section.blocks.map((block) => (
        <ReportBlockView block={block} key={`${section.order}:${JSON.stringify(block)}`} />
      ))}
    </section>
  ));
}

/** Customer-safe reader. Internal report IDs, gate results, and provenance never cross this boundary. */
export function SyntheticReportReader({
  fixture,
}: Readonly<{ fixture: CheckpointFourReportFixture }>) {
  const report = projectCustomerDelivery(fixture.report, fixture.bundle, fixture.verification);
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
              <li key={section.order}>
                <a href={`#customer-section-${section.order}`}>{section.title}</a>
              </li>
            ))}
          </ol>
        </nav>
        <article id="report-content">
          <header className="readerCover">
            <p className="readerEyebrow">Personal reflection</p>
            <h1>{report.title}</h1>
            <p className="readerDisplayName">{report.displayName}</p>
            <p className="readerDek">{report.disclaimer}</p>
          </header>
          <ReportSections report={report} />
          <footer className="readerSection readerMeta">
            <p>{report.disclaimer}</p>
            <p>
              This reading offers traditional practice prompts for reflection. Every prompt is
              optional, reversible, and not professional advice.
            </p>
          </footer>
        </article>
      </main>
    </>
  );
}
