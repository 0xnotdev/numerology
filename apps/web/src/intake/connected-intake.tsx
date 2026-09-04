"use client";

import { useEffect, useState } from "react";
import {
  createIntakeClient,
  draftToValues,
  type IntakePreview,
  IntakeRequestError,
  readIntakeCsrf,
  type SavedIntake,
  valuesToInput,
  valuesToPatch,
} from "./intake-client";
import { IntakeForm, type InitialIntakeValues } from "./intake-form";
import type { IntakeLocale, IntakeStep } from "./intake-progress";
import { LogoutButton } from "./logout-button";

export function ConnectedIntake({
  asOfDate,
  locale,
  intentId,
  initialStep = "name",
  privacyIdentity,
}: {
  asOfDate: string;
  locale: IntakeLocale;
  intentId?: string;
  initialStep?: IntakeStep;
  privacyIdentity: { controllerName: string; contactEmail: string } | null;
}) {
  const [client] = useState(() =>
    createIntakeClient({
      fetch: (...args) => fetch(...args),
      csrf: readIntakeCsrf,
      key: () => crypto.randomUUID(),
    }),
  );
  const [saved, setSaved] = useState<SavedIntake | null>(null);
  const [preview, setPreview] = useState<IntakePreview>();
  const [loading, setLoading] = useState(intentId !== undefined);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!intentId || !privacyIdentity || locale !== "en-IN") return;
    let active = true;
    void (async () => {
      try {
        const result = await client.load(intentId);
        if (result.intent.locale !== locale)
          throw new Error("Open this draft in its original language.");
        const resultPreview = result.intent.status === "draft" ? undefined : await client.preview();
        if (active) {
          setSaved(result);
          setPreview(resultPreview);
        }
      } catch (cause) {
        if (active)
          setError(
            cause instanceof IntakeRequestError
              ? cause.message
              : "This draft could not be loaded securely. Please try again.",
          );
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [client, intentId, locale, privacyIdentity]);

  if (!privacyIdentity || locale !== "en-IN")
    return (
      <section className="intakeShell">
        <h1>Private report intake</h1>
        <p>
          Secure submission is not open in this language yet. We are completing the privacy notice
          and service setup before collecting your details.
        </p>
        <a href="/">Return home</a>
      </section>
    );
  if (loading) return <p role="status">Loading your private draft…</p>;
  if (error)
    return (
      <section className="intakeShell">
        <p role="alert">{error}</p>
        <a href="/sign-in">Sign in</a> · <a href={`/${locale}/intake`}>Start a new report</a>
      </section>
    );

  async function advance(step: IntakeStep, values: InitialIntakeValues) {
    try {
      if (step === "review") {
        // If preview retrieval failed after completion, retry the read, never mutate the snapshot.
        if (saved?.intent.status !== "complete" && saved?.intent.status !== "preview_ready") {
          const result = await client.complete(valuesToInput(values, locale));
          setSaved(result);
        }
        setPreview(await client.preview());
      } else {
        // Do not send personal answers before the required processing choice is granted.
        if (!values.consent) return;
        const result = await client.save(locale, valuesToPatch(values, locale));
        setSaved(result);
        window.history.replaceState(null, "", `/${locale}/intake/${result.intent.id}/${step}`);
      }
    } catch (cause) {
      if (cause instanceof IntakeRequestError) throw cause;
      throw new Error(
        "We could not save your details. Check your answers and connection, then try again.",
      );
    }
  }
  return (
    <>
      <p className="intakeSaveStatus">
        After your privacy choice, Continue saves an encrypted server draft for up to seven days.
        Answers are never stored in browser storage. <a href="/sign-in">Sign in</a> ·{" "}
        <LogoutButton />
      </p>
      <IntakeForm
        asOfDate={asOfDate}
        locale={locale}
        initialStep={preview ? "preview" : initialStep}
        {...(saved && intentId ? { initialValues: draftToValues(saved.draft) } : {})}
        resumeFromSession={false}
        onAdvance={advance}
        onReset={() => window.location.assign(`/${locale}/intake`)}
        completed={saved?.intent.status === "complete" || saved?.intent.status === "preview_ready"}
        {...(preview ? { preview } : {})}
        privacyIdentity={privacyIdentity}
      />
    </>
  );
}
