import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ConnectedIntake } from "../../../../../intake/connected-intake";
import { getIntakePrivacyConfiguration } from "../../../../../server/report-intent-runtime";
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
      <ConnectedIntake
        asOfDate={currentCivilDate(new Date())}
        initialStep={parsed.step}
        intentId={parsed.intentId}
        locale={parsed.locale}
        privacyIdentity={getIntakePrivacyConfiguration()}
      />
    </main>
  );
}
