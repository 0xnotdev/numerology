import type { IntakeLocale } from "./intake-progress";

export const PRIVACY_NOTICE_VERSION = "privacy.2026-09-04.1" as const;

export interface PrivacyNoticeItem {
  readonly body: string;
  readonly label: string;
}

export interface PrivacyNotice {
  readonly contact: string;
  readonly eighteenPlus: string;
  readonly grievance: string;
  readonly intro: string;
  readonly items: readonly PrivacyNoticeItem[];
  readonly rights: string;
  readonly title: string;
  readonly version: typeof PRIVACY_NOTICE_VERSION;
}

const englishNotice: PrivacyNotice = {
  contact:
    "Controller and breach contact: The Numbered Life privacy desk at privacy@thenumberedlife.example. This reserved address is a pre-production contact and must be replaced with the reviewed live mailbox before launch.",
  eighteenPlus:
    "This product is for adults aged 18 and over (18+). We reject an under-18 subject before payment and do not claim to offer verifiable parental consent.",
  grievance:
    "For a grievance, you may complain to the privacy desk at the contact above. Our design target is a response within 30 days; escalation and processor incident contacts are handled through the same desk.",
  intro:
    "Read this notice before entering personal details. It explains what is collected, why, where processing occurs, how long it is kept, and how to exercise your choices.",
  items: [
    {
      label: "Controller and contact",
      body: "The Numbered Life is the controller for this report-intake service. Contact the privacy desk at privacy@thenumberedlife.example. ",
    },
    {
      label: "Required data and purpose",
      body: "We ask for birth name and current name to calculate and interpret the report, date of birth to perform the calculation and the adult eligibility check, selected language to produce the requested locale, and email to deliver and recover access to the report. Required-processing consent evidence records the notice version, purpose, time, and action.",
    },
    {
      label: "Processors and locations",
      body: "Google Cloud hosts the web service and PostgreSQL data plane in Mumbai, India. Amazon SES handles transactional email from its Mumbai region. Razorpay processes payment and the contact data needed for the transaction in India. Provider support systems and subprocessors may process limited data elsewhere under their current terms; we do not send date of birth or report text to the payment provider. No AI/LLM is used for this preview.",
    },
    {
      label: "Delivery",
      body: "The report is delivered through a private web reader and an expiring PDF link; the selected email receives access and transactional messages. We do not use WhatsApp for this product.",
    },
    {
      label: "Retention",
      body: "An unpaid draft and its names, date, and language are retained for up to 7 days for resume and preview, then erased or redacted. Paid report inputs and report artifacts follow the separate delivery/support schedule shown at checkout. Tax, invoice, consent, and security records may have longer legally required retention and are kept separately.",
    },
    {
      label: "Current browser behavior",
      body: "This UI shell does not save answers to browser storage or submit them yet; values are not written to browser storage and remain only in the current tab while you review them. The production save step will encrypt the draft before retaining it for the stated 7-day resume and preview window.",
    },
  ],
  rights:
    "You can request access, a machine-readable export, correction, erasure, withdrawal of optional analytics or marketing consent, or deletion of an unpaid draft. Required processing cannot be withdrawn while a requested report or legal obligation needs it; you may stop before submitting. Requests require account verification and never expose another subject.",
  title: "Privacy notice v1 (English)",
  version: PRIVACY_NOTICE_VERSION,
};

const localizedHeadings: Record<IntakeLocale, Pick<PrivacyNotice, "title" | "intro">> = {
  "en-IN": { title: englishNotice.title, intro: englishNotice.intro },
  "hi-IN": {
    title: "गोपनीयता सूचना v1 (अंग्रेज़ी में पूरी सूचना)",
    intro:
      "व्यक्तिगत जानकारी भरने से पहले यह सूचना पढ़ें। नीचे जानकारी, उद्देश्य, स्थान, अवधि और आपके अधिकार स्पष्ट किए गए हैं।",
  },
  "or-IN": {
    title: "ଗୋପନୀୟତା ସୂଚନା v1 (ସମ୍ପୂର୍ଣ୍ଣ ସୂଚନା ଇଂରାଜୀରେ)",
    intro: "ବ୍ୟକ୍ତିଗତ ତଥ୍ୟ ଦେବା ପୂର୍ବରୁ ଏହି ସୂଚନା ପଢନ୍ତୁ। ତଳେ ତଥ୍ୟ, ଉଦ୍ଦେଶ୍ୟ, ସ୍ଥାନ, ସମୟ ଏବଂ ଆପଣଙ୍କ ଅଧିକାର ଦିଆଯାଇଛି।",
  },
};

export function getPrivacyNotice(
  locale: IntakeLocale,
  identity?: { controllerName: string; contactEmail: string },
): PrivacyNotice {
  const headings = localizedHeadings[locale];
  return {
    ...englishNotice,
    title: headings.title,
    intro: headings.intro,
    ...(identity
      ? {
          contact: `${identity.controllerName} privacy desk: ${identity.contactEmail}`,
          items: englishNotice.items.map((item) =>
            item.label === "Controller and contact"
              ? {
                  ...item,
                  body: `${identity.controllerName} is the controller for this report-intake service. Contact the privacy desk at ${identity.contactEmail}.`,
                }
              : item.label === "Current browser behavior"
                ? {
                    ...item,
                    body: "Your answers are not written to browser storage. Continue saves an encrypted server draft for up to seven days. Resume requires the same browser's signed draft cookie and an authenticated account. Clearing this tab does not delete a saved server draft; contact the privacy desk to request deletion.",
                  }
                : item,
          ),
        }
      : {}),
  };
}
