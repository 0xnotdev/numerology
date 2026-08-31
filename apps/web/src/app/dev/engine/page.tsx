import { calculateFixture } from "@numerology/engine";
import { parseAppEnvironment } from "@numerology/contracts";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isDeveloperFixtureEnvironment } from "../../../server/readiness-fixture";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  robots: { follow: false, index: false },
  title: "Numerology engine fixture",
};

export default function EngineFixturePage() {
  const environment = parseAppEnvironment(process.env);
  if (!isDeveloperFixtureEnvironment(environment.APP_ENV)) {
    notFound();
  }

  const lifePath = calculateFixture("G-W-LP-001");
  const loShu = calculateFixture("G-LS-RAW-001");
  const lifePathFact = lifePath.bundle.facts.find(
    (fact) => fact.factId === "western_decoz_v1.life_path",
  );
  const loShuFact = loShu.bundle.facts.find((fact) => fact.factId === "loshu_raw_dob_v1.grid");

  return (
    <main className="developerFixture">
      <section className="developerFixtureCard engineFixtureCard" aria-labelledby="fixture-title">
        <p className="eyebrow">CHECKPOINT 2 · SYNTHETIC ENGINE FIXTURE</p>
        <h1 id="fixture-title">Deterministic numerology engine</h1>
        <p className="quiet">
          Synthetic-only local fixture. No customer names, database calls, LLMs, payments, or report
          generation run on this page. It is unavailable when APP_ENV is production.
        </p>
        <dl>
          <div>
            <dt>Environment</dt>
            <dd>{environment.APP_ENV}</dd>
          </div>
          <div>
            <dt>Engine version</dt>
            <dd>{lifePath.bundle.engineVersion}</dd>
          </div>
          <div>
            <dt>Manifest hash</dt>
            <dd>{lifePath.bundle.formulaManifestHash}</dd>
          </div>
        </dl>
        <section className="engineFixtureGrid" aria-label="Synthetic calculation evidence">
          <article>
            <p className="folioKicker">{lifePath.fixtureId}</p>
            <h2>Decoz Life Path</h2>
            <p className="engineFixtureNumber">{lifePathFact?.root}</p>
            <p className="quiet">Compound {lifePathFact?.compound}; components 8 + 3 + 1.</p>
          </article>
          <article>
            <p className="folioKicker">{loShu.fixtureId}</p>
            <h2>Lo Shu raw grid</h2>
            <p className="quiet">Counts are zero-aware and zeros are ignored, never inferred.</p>
            <pre>{JSON.stringify(loShuFact?.occurrences, null, 2)}</pre>
          </article>
        </section>
      </section>
    </main>
  );
}
