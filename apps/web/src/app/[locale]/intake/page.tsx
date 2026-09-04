import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ConnectedIntake } from "../../../intake/connected-intake";
import { getIntakePrivacyConfiguration } from "../../../server/report-intent-runtime";
import type { IntakeLocale } from "../../../intake/intake-progress";
import { currentCivilDate } from "../../../intake/intake-validation";

export const dynamic = "force-dynamic";

const supportedLocales = new Set<IntakeLocale>(["en-IN", "hi-IN", "or-IN"]);

export const metadata: Metadata = {
  robots: { follow: false, index: false, nocache: true },
  title: "Private intake · The Numbered Life",
};

export default async function IntakePage({
  params,
}: Readonly<{ params: Promise<{ locale: string }> }>) {
  const { locale } = await params;
  if (!supportedLocales.has(locale as IntakeLocale)) notFound();

  return (
    <main className="intakePage">
      <ConnectedIntake
        asOfDate={currentCivilDate(new Date())}
        locale={locale as IntakeLocale}
        privacyIdentity={getIntakePrivacyConfiguration()}
      />
    </main>
  );
}
