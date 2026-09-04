"use client";

import { useEffect, useRef, useState } from "react";

export function ConfirmSignIn({
  navigate = (path) => window.location.assign(path),
}: {
  navigate?: (path: string) => void;
}) {
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("Checking your link…");
  const inspected = useRef(false);
  useEffect(() => {
    if (inspected.current) return;
    inspected.current = true;
    const fragment = window.location.hash.slice(1);
    // Remove the secret from browser history before any API request. It never goes to storage.
    window.history.replaceState(null, "", window.location.pathname);
    if (/^[A-Za-z0-9_-]{43}$/u.test(fragment)) {
      setToken(fragment);
      setMessage("Confirm to sign in. Use the same browser where you requested this link.");
    } else setMessage("This link is missing or invalid. Please request a new one.");
  }, []);
  async function confirm() {
    if (!token || busy) return;
    setBusy(true);
    try {
      const result = await fetch("/api/v1/auth/magic-link/consume", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
        signal: AbortSignal.timeout(15000),
      });
      if (result.status === 200) {
        setToken(null);
        navigate("/en-IN/account");
      } else if (result.status === 401 || result.status === 400) {
        setToken(null);
        setMessage(
          "This link expired, was already used, or belongs to another browser. Please request a new one.",
        );
      } else setMessage("Sign-in is temporarily unavailable. Please try again.");
    } catch {
      setMessage(
        "We could not confirm sign-in. Try again, or request a new link if this one was already used.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="authShell">
      <section className="authCard" aria-labelledby="confirm-title">
        <h1 id="confirm-title">Confirm sign-in</h1>
        <p role="status" aria-live="polite">
          {message}
        </p>
        <button type="button" onClick={confirm} disabled={busy || token === null}>
          {busy ? "Signing in…" : "Confirm sign-in"}
        </button>
        <p>
          <a href="/sign-in">Request a new link</a>
        </p>
      </section>
    </main>
  );
}
