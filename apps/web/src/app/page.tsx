const included = [
  "Your core numbers, with the working shown",
  "Strengths, tensions, relationships, work and money themes",
  "Your current annual and monthly rhythm",
  "A clear action summary and downloadable PDF",
];

export default function HomePage() {
  return (
    <main>
      <nav className="nav" aria-label="Primary navigation">
        <a className="brand" href="#top" aria-label="Numerology report home">
          <span aria-hidden="true" className="brandMark">
            9
          </span>
          The Numbered Life
        </a>
        <a className="navLink" href="#method">
          Our method
        </a>
      </nav>

      <section className="hero" id="top">
        <div className="heroCopy">
          <p className="eyebrow">A PERSONAL READING · WEB + PDF</p>
          <h1>Your numbers, interpreted with care.</h1>
          <p className="lede">
            A substantial, personalized report that brings several numerology traditions into one
            clear reading—without hiding where their methods differ.
          </p>
          <div className="offer">
            <a className="button" href="#report">
              Begin your report <span aria-hidden="true">→</span>
            </a>
            <p>
              <strong>₹499</strong> · one-time payment · no subscription
            </p>
          </div>
          <p className="quiet">Takes about 4 minutes. Your draft is saved securely.</p>
        </div>

        <aside className="folio" aria-label="Sample report contents">
          <p className="folioKicker">Prepared for</p>
          <p className="folioName">Ananya Rao</p>
          <div className="numberSeal" aria-hidden="true">
            <span>Life path</span>
            <strong>7</strong>
          </div>
          <p className="folioCaption">Clarity for the patterns you already sense.</p>
        </aside>
      </section>

      <section className="reportBand" id="report">
        <div>
          <p className="eyebrow">THE COMPLETE REPORT</p>
          <h2>Insightful enough to revisit. Practical enough to use.</h2>
        </div>
        <ul>
          {included.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>

      <section className="method" id="method">
        <p className="chapterNumber">01</p>
        <div>
          <p className="eyebrow">AN HONEST METHOD</p>
          <h2>Calculation first. Interpretation second.</h2>
          <p>
            Your numbers are calculated by deterministic, versioned rules. The prose is built from
            those results and checked against the cited tradition. Where schools disagree, the
            report shows the difference instead of blending it away.
          </p>
          <p className="disclaimer">
            Numerology is a reflective tradition, not a scientific prediction or professional advice
            service.
          </p>
        </div>
      </section>
    </main>
  );
}
