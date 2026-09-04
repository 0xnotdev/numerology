import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { IntakeForm } from "./intake-form";

const completeValues = {
  birthName: "Anita Rao",
  currentName: "Anita Rao",
  dateOfBirth: "1990-08-12",
  email: "synthetic@example.invalid",
  consent: true,
};

describe("intake form", () => {
  it("returns direct later-step requests to the earliest unanswered question", () => {
    const html = renderToStaticMarkup(
      <IntakeForm asOfDate="2026-09-03" initialStep="preview" locale="en-IN" />,
    );
    expect(html).toContain("Tell us what to call you");
    expect(html).not.toContain("Preview before payment");
  });
  it("renders a complete, accessible English question surface", () => {
    const html = renderToStaticMarkup(<IntakeForm asOfDate="2026-09-03" locale="en-IN" />);

    expect(html).toContain("Tell us what to call you");
    expect(html).toContain('aria-label="Intake progress"');
    expect(html).toContain('autoComplete="name"');
    expect(html).toContain("Privacy notice v1");
    expect(html).toContain("Numerology is a reflective tradition");
    expect(html).toContain('name="birthName"');
    expect(html).toContain('name="currentName"');
    expect(html).not.toContain("confidence");
    expect(html).not.toContain("ranking");
    expect(html).not.toContain("reportHash");
    expect(html).not.toContain("complete draft is saved server-side");
    expect(html).toContain("The current page does not save answers to browser storage");
  });

  it("keeps each progressive question native and labelled", () => {
    const date = renderToStaticMarkup(
      <IntakeForm
        asOfDate="2026-09-03"
        initialStep="birth-date"
        initialValues={completeValues}
        locale="en-IN"
      />,
    );
    const delivery = renderToStaticMarkup(
      <IntakeForm
        asOfDate="2026-09-03"
        initialStep="delivery"
        initialValues={completeValues}
        locale="en-IN"
      />,
    );

    expect(date).toContain('autoComplete="bday"');
    expect(date).toContain('type="date"');
    expect(delivery).toContain('autoComplete="email"');
    expect(delivery).toContain('type="email"');
    expect(delivery.match(/type="checkbox"/gu)).toHaveLength(3);
    expect(delivery).toContain('name="requiredProcessing"');
    expect(delivery).toContain('name="analyticsConsent"');
    expect(delivery).toContain('name="marketingConsent"');
    expect(delivery).not.toContain('name="analyticsConsent" checked');
    expect(delivery).not.toContain('name="marketingConsent" checked');

    const preview = renderToStaticMarkup(
      <IntakeForm
        asOfDate="2026-09-03"
        initialStep="preview"
        initialValues={completeValues}
        locale="en-IN"
      />,
    );
    expect(preview).toContain("Preview before payment");
  });

  it("localizes the visible question copy for Hindi and Odia", () => {
    const hindi = renderToStaticMarkup(<IntakeForm asOfDate="2026-09-03" locale="hi-IN" />);
    const odia = renderToStaticMarkup(<IntakeForm asOfDate="2026-09-03" locale="or-IN" />);

    expect(hindi).toContain("अपना नाम बताइए");
    expect(hindi).toContain("आपकी जानकारी निजी रखी जाएगी");
    expect(odia).toContain("ଆପଣଙ୍କ ନାମ କୁହନ୍ତୁ");
    expect(odia).toContain("ଆପଣଙ୍କ ତଥ୍ୟ ବ୍ୟକ୍ତିଗତ ରହିବ");

    const hindiDelivery = renderToStaticMarkup(
      <IntakeForm
        asOfDate="2026-09-03"
        initialStep="delivery"
        initialValues={completeValues}
        locale="hi-IN"
      />,
    );
    expect(hindiDelivery).toContain("पूरी गोपनीयता सूचना अभी अंग्रेज़ी में उपलब्ध है");
    expect(hindiDelivery).not.toContain('name="requiredProcessing"');
  });

  it("keeps the privacy promise explicit about browser autosave", () => {
    const html = renderToStaticMarkup(<IntakeForm asOfDate="2026-09-03" locale="en-IN" />);

    expect(html).toContain("Only your place in the form is remembered in this browser");
    expect(html).toContain("The current page does not save answers to browser storage");
    expect(html).toContain("not written to browser storage");
  });

  it("renders a stable adult boundary and the non-Latin/Y confirmation branches", () => {
    const underage = renderToStaticMarkup(
      <IntakeForm
        asOfDate="2026-09-03"
        initialStep="birth-date"
        initialValues={{ ...completeValues, dateOfBirth: "2008-09-04" }}
        locale="en-IN"
      />,
    );
    const nameBranches = renderToStaticMarkup(
      <IntakeForm
        asOfDate="2026-09-03"
        initialValues={{ birthName: "आर्या", currentName: "Riya" }}
        locale="en-IN"
      />,
    );

    expect(underage).toContain('max="2026-09-03"');
    expect(underage).toContain('role="alert"');
    expect(underage).toContain("must be 18 or older");
    expect(nameBranches).toContain('name="birthName.engineLatin"');
    expect(nameBranches).toContain('name="currentName.yClassification.2"');
    expect(nameBranches).toContain('name="birthName.engineLatinConfirmed"');
    expect(nameBranches).not.toContain('name="currentName.engineLatin"');
  });
});
