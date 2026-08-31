import { parseAppEnvironment } from "@numerology/contracts";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { checkDatabaseReadiness } from "../../../server/database-readiness";
import { isDeveloperFixtureEnvironment } from "../../../server/readiness-fixture";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  robots: { follow: false, index: false },
  title: "Database readiness fixture",
};

export default async function ReadinessFixturePage() {
  const environment = parseAppEnvironment(process.env);
  if (!isDeveloperFixtureEnvironment(environment.APP_ENV)) {
    notFound();
  }

  let ready = false;
  try {
    ready = await checkDatabaseReadiness();
  } catch {
    // The fixture shares the public readiness endpoint's fail-closed behavior.
  }

  return (
    <main className="developerFixture">
      <section className="developerFixtureCard" aria-labelledby="fixture-title">
        <p className="eyebrow">CHECKPOINT 1 · DEVELOPER FIXTURE</p>
        <h1 id="fixture-title">Database readiness</h1>
        <p className="developerFixtureStatus" data-ready={ready} role="status">
          <span aria-hidden="true" />
          {ready ? "PostgreSQL is ready" : "PostgreSQL is unavailable"}
        </p>
        <dl>
          <div>
            <dt>Environment</dt>
            <dd>{environment.APP_ENV}</dd>
          </div>
          <div>
            <dt>Liveness</dt>
            <dd>
              <a href="/api/health/live">/api/health/live</a>
            </dd>
          </div>
          <div>
            <dt>Readiness</dt>
            <dd>
              <a href="/api/health/ready">/api/health/ready</a>
            </dd>
          </div>
        </dl>
        <p className="quiet">This page is not available when APP_ENV is production.</p>
      </section>
    </main>
  );
}
