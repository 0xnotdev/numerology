"use client";

import { type FormEvent, useState } from "react";

export function SignInForm() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setMessage("");
    try {
      const result = await fetch("/api/v1/auth/magic-link", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, locale: "en-IN" }),
        signal: AbortSignal.timeout(15000),
      });
      if (result.status === 202) {
        setEmail("");
        setMessage("Check your email for a sign-in link. Open it in this same browser.");
      } else if (result.status === 429) setMessage("Please wait before requesting another link.");
      else setMessage("Sign-in is temporarily unavailable. Please try again later.");
    } catch {
      setMessage("We could not reach sign-in. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="authShell">
      <a className="brand" href="/">
        The Numbered Life
      </a>
      <section className="authCard" aria-labelledby="sign-in-title">
        <p className="eyebrow">YOUR PRIVATE REPORTS</p>
        <h1 id="sign-in-title">Sign in with your email</h1>
        <p>
          No password needed. Your link expires in 10 minutes and works only in the same browser
          that requests it.
        </p>
        <form onSubmit={submit}>
          <label htmlFor="sign-in-email">Email address</label>
          <input
            id="sign-in-email"
            type="email"
            name="email"
            autoComplete="email"
            maxLength={254}
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            disabled={busy}
          />
          <button type="submit" disabled={busy}>
            {busy ? "Sending…" : "Email me a sign-in link"}
          </button>
        </form>
        <p role="status" aria-live="polite">
          {message}
        </p>
        <p>
          Your email is used for this sign-in request. This does not subscribe you to marketing.
        </p>
      </section>
    </main>
  );
}
