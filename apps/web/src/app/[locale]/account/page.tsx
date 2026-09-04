import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AccountShell } from "../../../private-access/account-shell";

const supportedLocales = new Set(["en-IN", "hi-IN", "or-IN"]);

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  referrer: "no-referrer",
  robots: { follow: false, index: false, nocache: true },
  title: "Your private reports · The Numbered Life",
};

export default async function AccountPage({
  params,
}: Readonly<{ params: Promise<{ locale: string }> }>) {
  const { locale } = await params;
  if (!supportedLocales.has(locale)) notFound();

  return <AccountShell />;
}
