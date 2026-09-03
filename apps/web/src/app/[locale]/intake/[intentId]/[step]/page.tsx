import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { IntakeForm } from "../../../../../intake/intake-form";
import { parseIntakeRoute } from "../../../../../intake/intake-route";
import { currentCivilDate } from "../../../../../intake/intake-validation";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  robots: { follow: false, index: false, nocache: true },
  title: "Private intake · The Numbered Life",
};

export default async function ExistingIntakePage({
  params,
}: Readonly<{
  params: Promise<{ intentId: string; locale: string; step: string }>;
}>) {
  const { intentId, locale, step } = await params;
  const parsed = parseIntakeRoute(locale, intentId, step);
  if (parsed === null) notFound();

  return (
    <main className="intakePage">
      <IntakeForm
        asOfDate={currentCivilDate(new Date())}
        // Until the secure draft loader is composed, deep links cannot assert that prior steps passed.
        // Start at the first question so an opaque URL cannot bypass validation.
        initialStep="name"
        locale={parsed.locale}
        resumeFromSession={false}
      />
    </main>
  );
}
