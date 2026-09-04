import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ReportShell } from "../../../../private-access/report-shell";

const supportedLocales = new Set(["en-IN", "hi-IN", "or-IN"]);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  referrer: "no-referrer",
  robots: { follow: false, index: false, nocache: true },
  title: "Private numerology report · The Numbered Life",
};

export default async function ReportPage({
  params,
}: Readonly<{ params: Promise<{ locale: string; reportId: string }> }>) {
  const { locale, reportId } = await params;
  if (!supportedLocales.has(locale) || !uuid.test(reportId)) notFound();

  return <ReportShell key={`${locale}:${reportId}`} locale={locale} reportId={reportId} />;
}
