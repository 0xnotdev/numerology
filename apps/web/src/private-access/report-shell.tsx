"use client";
import { useEffect, useState } from "react";
import {
  createPrivateAccessClient,
  type CustomerBlock,
  type CustomerPractice,
  type CustomerReport,
  privateAccessMessage,
} from "./private-client";
function Block({ block }: { block: CustomerBlock }) {
  switch (block.type) {
    case "prose":
      return (
        <div>
          {block.paragraphs.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </div>
      );
    case "number_card":
      return (
        <figure className="privateNumber">
          <strong>{block.value}</strong>
          <figcaption>{block.caption}</figcaption>
        </figure>
      );
    case "comparison":
      return (
        <div className="privateComparison">
          <p>
            <strong>{block.left.label}</strong> {block.left.value}
          </p>
          <p>
            <strong>{block.right.label}</strong> {block.right.value}
          </p>
          <p>{block.body}</p>
        </div>
      );
    case "lo_shu":
      return (
        <figure>
          <div className="privateGrid">
            {block.grid.map((cell) => (
              <span key={cell.digit}>
                <strong>{cell.digit}</strong>
                <small>× {cell.count}</small>
              </span>
            ))}
          </div>
          <figcaption>{block.caption}</figcaption>
        </figure>
      );
    case "timeline":
      return (
        <dl>
          {block.items.map((item) => (
            <div key={item.label}>
              <dt>{item.label}</dt>
              <dd>{item.value}</dd>
            </div>
          ))}
        </dl>
      );
    case "source_note":
      return <p className="quiet">{block.body}</p>;
  }
}
function Practices({ title, items }: { title: string; items: readonly CustomerPractice[] }) {
  return (
    <section>
      <h2>{title}</h2>
      <ul>
        {items.map((item) => (
          <li key={item.label}>
            <strong>{item.label}</strong>{" "}
            {item.availability === "available" ? item.instruction : item.message}
          </li>
        ))}
      </ul>
    </section>
  );
}
function renderBlocks(blocks: readonly CustomerBlock[]) {
  const occurrences = new Map<string, number>();
  return blocks.map((block) => {
    const contentKey = JSON.stringify(block);
    const occurrence = occurrences.get(contentKey) ?? 0;
    occurrences.set(contentKey, occurrence + 1);
    return <Block block={block} key={`${contentKey}:${occurrence}`} />;
  });
}
export function ReportShell({ locale, reportId }: { locale: string; reportId: string }) {
  const [client] = useState(() => createPrivateAccessClient());
  const [report, setReport] = useState<CustomerReport>();
  const [error, setError] = useState<string>();
  const [message, setMessage] = useState<string>();
  const [busyAction, setBusyAction] = useState<string>();
  useEffect(() => {
    let active = true;
    void client
      .report(reportId)
      .then((value) => {
        if (active && value.locale === locale) setReport(value);
        else if (active) setError("This private report is not available.");
      })
      .catch((cause: unknown) => {
        if (active) setError(privateAccessMessage(cause, "This private report is not available."));
      });
    return () => {
      active = false;
    };
  }, [client, locale, reportId]);
  async function request(action: "correction" | "export" | "deletion") {
    if (busyAction) return;
    setBusyAction(action);
    setMessage(undefined);
    try {
      await client.request(reportId, action);
      setMessage(
        `${action[0]?.toUpperCase()}${action.slice(1)} request received. This does not mean processing is complete.`,
      );
    } catch (cause) {
      setMessage(privateAccessMessage(cause, "Private report access is temporarily unavailable."));
    } finally {
      setBusyAction(undefined);
    }
  }
  if (error)
    return (
      <main className="privateShell">
        <section className="privatePanel">
          <p role="alert">{error}</p>
          <a href={`/${locale}/account`}>Return to your reports</a> ·{" "}
          <a href="/sign-in">Sign in again</a>
        </section>
      </main>
    );
  if (!report)
    return (
      <main className="privateShell">
        <p role="status">Loading your private report…</p>
      </main>
    );
  return (
    <main className="privateShell">
      <header className="privateHeader">
        <a href={`/${locale}/account`}>← Your reports</a>
        <span>Private report</span>
      </header>
      <article className="privateReport">
        <p className="eyebrow">FOR {report.displayName}</p>
        <h1>{report.title}</h1>
        <p className="lede">{report.disclaimer}</p>
        <nav aria-label="Report contents">
          <ol>
            {report.sections.map((section) => (
              <li key={section.order}>
                <a href={`#section-${section.order}`}>{section.title}</a>
              </li>
            ))}
          </ol>
        </nav>
        {report.sections.map((section) => (
          <section id={`section-${section.order}`} key={section.order}>
            <p className="eyebrow">SECTION {section.order}</p>
            <h2>{section.title}</h2>
            {section.dek && <p>{section.dek}</p>}
            {renderBlocks(section.blocks)}
          </section>
        ))}
        <Practices title="Optional traditional practices" items={report.traditionalPractices} />
        <Practices title="Practical alternatives" items={report.practicalAlternatives} />
        <section aria-labelledby="account-actions">
          <h2 id="account-actions">Your data and corrections</h2>
          <div className="privateActions">
            <button
              disabled={busyAction !== undefined}
              type="button"
              onClick={() => void request("correction")}
            >
              Request a correction
            </button>
            <button
              disabled={busyAction !== undefined}
              type="button"
              onClick={() => void request("export")}
            >
              Request data export
            </button>
            <button
              disabled={busyAction !== undefined}
              type="button"
              onClick={() => void request("deletion")}
            >
              Request deletion
            </button>
            <button type="button" disabled>
              PDF download is not available yet
            </button>
          </div>
          {message && <p role="status">{message}</p>}
        </section>
      </article>
    </main>
  );
}
