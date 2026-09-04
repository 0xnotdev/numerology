"use client";
import { useEffect, useState } from "react";
import {
  createPrivateAccessClient,
  type AccountReport,
  privateAccessMessage,
} from "./private-client";
export function AccountShell({
  navigate = (path) => window.location.assign(path),
}: {
  navigate?: (path: string) => void;
}) {
  const [client] = useState(() => createPrivateAccessClient());
  const [reports, setReports] = useState<readonly AccountReport[]>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    void client
      .account()
      .then((value) => {
        if (active) setReports(value.reports);
      })
      .catch((cause: unknown) => {
        if (active) setError(privateAccessMessage(cause, "Private account access is unavailable."));
      });
    return () => {
      active = false;
    };
  }, [client]);
  async function revoke() {
    if (busy) return;
    setBusy(true);
    setError(undefined);
    try {
      await client.revokeAll();
      navigate("/sign-in");
    } catch (cause) {
      setError(privateAccessMessage(cause, "Could not sign out."));
      setBusy(false);
    }
  }
  return (
    <main className="privateShell">
      <header className="privateHeader">
        <a className="brand" href="/">
          <span className="brandMark" aria-hidden="true">
            9
          </span>
          The Numbered Life
        </a>
        <button className="textButton" disabled={busy} onClick={() => void revoke()} type="button">
          Sign out of all devices
        </button>
      </header>
      <section className="privatePanel">
        <p className="eyebrow">PRIVATE ACCOUNT</p>
        <h1>Your reports</h1>
        <p>
          <a href="/en-IN/intake">Begin a new report</a>
        </p>
        {error && (
          <p role="alert">
            {error} <a href="/sign-in">Sign in again</a>
          </p>
        )}
        {reports === undefined && !error && <p role="status">Loading your private reports…</p>}
        {reports?.length === 0 && <p>No reports are ready yet.</p>}
        <ul className="privateReportList">
          {reports?.map((report) => (
            <li key={report.id}>
              <a href={`/${report.locale}/reports/${report.id}`}>{report.title}</a>
              <span>
                Ready{" "}
                {new Date(report.readyAt).toLocaleDateString("en-IN", {
                  dateStyle: "medium",
                  timeZone: "Asia/Kolkata",
                })}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
