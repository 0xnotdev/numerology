import { parseAppEnvironment } from "@numerology/contracts";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  isReportFixtureEnvironment,
  loadSyntheticReportFixture,
} from "../../../server/report-fixture";
import { SyntheticReportReader } from "./report-reader";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  robots: { follow: false, index: false, nocache: true },
  title: "Synthetic verified report fixture",
};

export default async function SyntheticReportFixturePage({
  params,
}: Readonly<{ params: Promise<{ id: string }> }>) {
  const environment = parseAppEnvironment(process.env);
  if (process.env.NODE_ENV === "production" || !isReportFixtureEnvironment(environment.APP_ENV)) {
    notFound();
  }

  const { id } = await params;
  const fixture = loadSyntheticReportFixture(id);
  if (fixture === null) {
    notFound();
  }

  return <SyntheticReportReader fixture={fixture} />;
}
