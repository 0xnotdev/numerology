"use client";

import { type FormEvent, useEffect, useState } from "react";
import {
  decodeIntakeProgress,
  encodeIntakeProgress,
  type IntakeLocale,
  type IntakeStep,
  intakeSteps,
} from "./intake-progress";
import { needsLatinSpelling, validateAdultBirthDate, yOccurrences } from "./intake-validation";
import { getPrivacyNotice } from "./privacy-notice";

interface IntakeCopy {
  readonly analyticsConsentLabel: string;
  readonly backLabel: string;
  readonly birthDateLabel: string;
  readonly birthDateInvalidError: string;
  readonly birthDateUnderageError: string;
  readonly continueLabel: string;
  readonly currentNameLabel: string;
  readonly dateHint: string;
  readonly deliveryLabel: string;
  readonly emailLabel: string;
  readonly intro: string;
  readonly nameHint: string;
  readonly nameLabel: string;
  readonly nextLabel: string;
  readonly previewBody: string;
  readonly previewLabel: string;
  readonly previewTitle: string;
  readonly privacyBody: string;
  readonly privacyTitle: string;
  readonly latinConfirmLabel: string;
  readonly latinSpellingHint: string;
  readonly latinSpellingLabel: string;
  readonly marketingConsentLabel: string;
  readonly privacyAgeLabel: string;
  readonly privacyBreachLabel: string;
  readonly privacyBreachBody: string;
  readonly privacyGrievanceLabel: string;
  readonly privacyLocaleGate: string;
  readonly privacyRightsLabel: string;
  readonly reviewBody: string;
  readonly reviewTitle: string;
  readonly saveStatus: string;
  readonly scientificNote: string;
  readonly startOverLabel: string;
  readonly stepLabels: Record<IntakeStep, string>;
  readonly title: string;
  readonly birthNameLabel: string;
  readonly consentLabel: string;
  readonly yConsonantLabel: string;
  readonly yHint: string;
  readonly intakeEyebrow: string;
  readonly previewHandoff: string;
  readonly yTitle: string;
  readonly yVowelLabel: string;
  readonly noScriptNotice: string;
}

const copy: Record<IntakeLocale, IntakeCopy> = {
  "en-IN": {
    analyticsConsentLabel:
      "Optional: share anonymous step and performance events to help us improve the intake.",
    backLabel: "Back",
    birthDateLabel: "Your date of birth",
    birthDateInvalidError: "Enter a real calendar date that is not in the future.",
    birthDateUnderageError: "The subject must be 18 or older to use this report.",
    continueLabel: "Continue",
    currentNameLabel: "The name you use now",
    dateHint: "Use the date shown on your official record. We do not ask for birth time or place.",
    deliveryLabel: "Where should we send your report?",
    emailLabel: "Email address",
    intro: "A few details are enough. You can review everything before payment.",
    nameHint:
      "Use the name as you know it. We may ask for a confirmed Latin spelling when a calculation needs one.",
    nameLabel: "Your name",
    nextLabel: "Next question",
    previewBody:
      "Once the production save step is connected, the secure preview will contain three exact numbers and short rule-based labels generated from reviewed details before you decide whether to pay.",
    previewLabel: "A small look before checkout",
    previewTitle: "Preview before payment",
    privacyBody:
      "Only your place in the form is remembered in this browser session. The current page does not save answers to browser storage or submit them yet. The production save step will use encrypted server storage for up to 7 days for resume and preview.",
    privacyTitle: "Privacy, plainly stated",
    latinConfirmLabel: "I confirm this Latin spelling is the one to use for calculation.",
    latinSpellingHint:
      "Your displayed name stays unchanged. This separate spelling only makes the calculation input explicit.",
    latinSpellingLabel: "Latin spelling for calculation",
    marketingConsentLabel: "Optional: send occasional product news and offers by email.",
    privacyAgeLabel: "18+ rule.",
    privacyBreachLabel: "Breach contact.",
    privacyBreachBody: "The privacy desk will notify affected people without delay when required.",
    privacyGrievanceLabel: "Grievance.",
    privacyLocaleGate: "",
    privacyRightsLabel: "Rights and choices.",
    reviewBody:
      "Check the details exactly as you want them interpreted. You can go back and change any answer.",
    reviewTitle: "Review your details",
    saveStatus: "Your place in this browser session is remembered for 24 hours.",
    scientificNote:
      "Numerology is a reflective tradition, not a scientific prediction or professional advice service.",
    startOverLabel: "Start over",
    stepLabels: {
      "birth-date": "Birth date",
      delivery: "Delivery",
      name: "Name",
      preview: "Preview",
      review: "Review",
    },
    title: "Tell us what to call you",
    birthNameLabel: "Your birth name",
    consentLabel:
      "Required: I have read the privacy notice and agree that my details may be processed to create this report.",
    yConsonantLabel: "Y sounds like a consonant",
    yHint:
      "Y can be a vowel or consonant depending on pronunciation. Choose for this occurrence; we will not guess.",
    yTitle: "How should we treat this Y?",
    yVowelLabel: "Y sounds like a vowel",
    intakeEyebrow: "PRIVATE INTAKE · ABOUT 4 MINUTES",
    noScriptNotice:
      "Please enable JavaScript to use the interactive intake. No answers are stored in this browser.",
    previewHandoff: "Secure calculation starts after you confirm these details.",
  },
  "hi-IN": {
    analyticsConsentLabel: "वैकल्पिक: फ़ॉर्म सुधारने में मदद के लिए अनाम चरण और प्रदर्शन घटनाएँ साझा करें।",
    backLabel: "पीछे",
    birthDateLabel: "आपकी जन्मतिथि",
    birthDateInvalidError: "भविष्य की तारीख नहीं, एक वास्तविक कैलेंडर तारीख लिखें।",
    birthDateUnderageError: "इस रिपोर्ट के लिए विषय की आयु 18 वर्ष या उससे अधिक होनी चाहिए।",
    continueLabel: "आगे बढ़ें",
    currentNameLabel: "आप अभी जिस नाम का उपयोग करते हैं",
    dateHint: "अपनी आधिकारिक तिथि लिखें। हम जन्म का समय या स्थान नहीं पूछते।",
    deliveryLabel: "रिपोर्ट कहाँ भेजें?",
    emailLabel: "ईमेल पता",
    intro: "कुछ जानकारी पर्याप्त है। भुगतान से पहले आप सब कुछ देख सकेंगे।",
    nameHint: "अपना जाना-पहचाना नाम लिखें। गणना के लिए ज़रूरत होने पर हम लैटिन वर्तनी की पुष्टि पूछ सकते हैं।",
    nameLabel: "अपना नाम बताइए",
    nextLabel: "अगला प्रश्न",
    previewBody:
      "उत्पादन सेव से जुड़ने के बाद सुरक्षित प्रीव्यू में तीन सटीक अंक और छोटे नियम-आधारित संकेत होंगे। भुगतान का निर्णय लेने से पहले यह जाँची गई जानकारी से बनेगा।",
    previewLabel: "चेकआउट से पहले एक झलक",
    previewTitle: "भुगतान से पहले प्रीव्यू",
    privacyBody:
      "इस ब्राउज़र सत्र में केवल फ़ॉर्म की आपकी जगह याद रखी जाती है। वर्तमान पृष्ठ उत्तरों को ब्राउज़र में सहेजता या अभी भेजता नहीं है। उत्पादन में जुड़ने के बाद सुरक्षित सर्वर ड्राफ्ट को प्रीव्यू और फिर से शुरू करने के लिए अधिकतम 7 दिनों तक रखेगा।",
    privacyTitle: "आपकी जानकारी निजी रखी जाएगी",
    latinConfirmLabel: "मैं पुष्टि करता/करती हूँ कि गणना के लिए यही लैटिन वर्तनी उपयोग की जाए।",
    latinSpellingHint: "दिखाया गया नाम नहीं बदलेगा। यह अलग वर्तनी केवल गणना के इनपुट को स्पष्ट करती है।",
    latinSpellingLabel: "गणना के लिए लैटिन वर्तनी",
    marketingConsentLabel: "वैकल्पिक: ईमेल से कभी-कभी उत्पाद समाचार और ऑफ़र भेजें।",
    privacyAgeLabel: "18+ नियम।",
    privacyBreachLabel: "डेटा उल्लंघन संपर्क।",
    privacyBreachBody: "जहाँ आवश्यक होगा, गोपनीयता डेस्क प्रभावित लोगों को बिना देरी सूचित करेगा।",
    privacyGrievanceLabel: "शिकायत।",
    privacyLocaleGate: "पूरी गोपनीयता सूचना अभी अंग्रेज़ी में उपलब्ध है। सहमति देने के लिए कृपया अंग्रेज़ी चुनें।",
    privacyRightsLabel: "आपके अधिकार और विकल्प।",
    reviewBody:
      "जानकारी को ठीक वैसे जाँचें जैसे आप उसकी व्याख्या चाहते हैं। आप किसी भी उत्तर को बदलने के लिए पीछे जा सकते हैं।",
    reviewTitle: "अपनी जानकारी जाँचें",
    saveStatus: "फ़ॉर्म में आपकी जगह इस ब्राउज़र सत्र में 24 घंटे के लिए याद रखी जाती है।",
    scientificNote: "अंकशास्त्र एक चिंतनशील परंपरा है, वैज्ञानिक भविष्यवाणी या पेशेवर सलाह नहीं।",
    startOverLabel: "फिर से शुरू करें",
    stepLabels: {
      "birth-date": "जन्मतिथि",
      delivery: "डिलीवरी",
      name: "नाम",
      preview: "प्रीव्यू",
      review: "जाँच",
    },
    title: "अपना नाम बताइए",
    birthNameLabel: "आपका जन्म नाम",
    consentLabel:
      "ज़रूरी: मैंने गोपनीयता सूचना पढ़ ली है और इस रिपोर्ट को बनाने के लिए अपनी जानकारी के उपयोग से सहमत हूँ।",
    yConsonantLabel: "Y व्यंजन की तरह सुनाई देता है",
    yHint: "उच्चारण के आधार पर Y स्वर या व्यंजन हो सकता है। इस स्थान के लिए चुनें; हम अनुमान नहीं लगाएंगे।",
    yTitle: "इस Y को कैसे गिनें?",
    yVowelLabel: "Y स्वर की तरह सुनाई देता है",
    intakeEyebrow: "निजी जानकारी · लगभग 4 मिनट",
    noScriptNotice: "इंटरैक्टिव फ़ॉर्म के लिए JavaScript चालू करें। इस ब्राउज़र में कोई उत्तर संग्रहीत नहीं है।",
    previewHandoff: "इन विवरणों की पुष्टि के बाद सुरक्षित गणना शुरू होगी।",
  },
  "or-IN": {
    analyticsConsentLabel: "ବୈକଳ୍ପିକ: ଫର୍ମକୁ ଉନ୍ନତ କରିବା ପାଇଁ ଅନାମିକ ପଦକ୍ଷେପ ଏବଂ ପ୍ରଦର୍ଶନ ଘଟଣା ସେୟାର କରନ୍ତୁ।",
    backLabel: "ପଛକୁ",
    birthDateLabel: "ଆପଣଙ୍କ ଜନ୍ମ ତାରିଖ",
    birthDateInvalidError: "ଭବିଷ୍ୟତ ତାରିଖ ନୁହେଁ, ଏକ ପ୍ରକୃତ କ୍ୟାଲେଣ୍ଡର ତାରିଖ ଦିଅନ୍ତୁ।",
    birthDateUnderageError: "ଏହି ରିପୋର୍ଟ ପାଇଁ ବିଷୟର ବୟସ ୧୮ ବର୍ଷ କିମ୍ବା ଅଧିକ ହେବା ଦରକାର।",
    continueLabel: "ଆଗକୁ ବଢ଼ନ୍ତୁ",
    currentNameLabel: "ଆପଣ ବର୍ତ୍ତମାନ ବ୍ୟବହାର କରୁଥିବା ନାମ",
    dateHint: "ଆପଣଙ୍କ ଅଧିକାରିକ ତାରିଖ ଦିଅନ୍ତୁ। ଆମେ ଜନ୍ମ ସମୟ କିମ୍ବା ସ୍ଥାନ ପଚାରୁନାହୁଁ।",
    deliveryLabel: "ରିପୋର୍ଟ କେଉଁଠାକୁ ପଠାଇବା?",
    emailLabel: "ଇମେଲ ଠିକଣା",
    intro: "କିଛି ତଥ୍ୟ ଯଥେଷ୍ଟ। ଦେୟ ପୂର୍ବରୁ ଆପଣ ସବୁକିଛି ଯାଞ୍ଚ କରିପାରିବେ।",
    nameHint: "ଆପଣ ଜାଣିଥିବା ନାମ ବ୍ୟବହାର କରନ୍ତୁ। ଗଣନା ପାଇଁ ଆବଶ୍ୟକ ହେଲେ ଲାଟିନ ବନାନର ନିଶ୍ଚିତତା ପଚରାଯାଇପାରେ।",
    nameLabel: "ଆପଣଙ୍କ ନାମ କୁହନ୍ତୁ",
    nextLabel: "ପରବର୍ତ୍ତୀ ପ୍ରଶ୍ନ",
    previewBody:
      "ଉତ୍ପାଦନ ସେବା ସହ ଯୋଡିବା ପରେ ସୁରକ୍ଷିତ ପ୍ରିଭ୍ୟୁରେ ତିନୋଟି ସଠିକ ଅଙ୍କ ଏବଂ ଛୋଟ ନିୟମ-ଆଧାରିତ ବ୍ୟାଖ୍ୟା ରହିବ। ଦେୟ ନିଷ୍ପତ୍ତି ପୂର୍ବରୁ ଏହା ଯାଞ୍ଚ ହୋଇଥିବା ତଥ୍ୟରୁ ତିଆରି ହେବ।",
    previewLabel: "ଚେକଆଉଟ ପୂର୍ବରୁ ଏକ ଝଲକ",
    previewTitle: "ଦେୟ ପୂର୍ବରୁ ପ୍ରିଭ୍ୟୁ",
    privacyBody:
      "ଏହି ବ୍ରାଉଜର ସେସନରେ କେବଳ ଫର୍ମରେ ଆପଣଙ୍କ ସ୍ଥାନ ମନେ ରଖାଯାଏ। ବର୍ତ୍ତମାନ ପୃଷ୍ଠା ଉତ୍ତରଗୁଡିକୁ ବ୍ରାଉଜରରେ ସଞ୍ଚୟ କିମ୍ବା ଏବେ ପଠାଏ ନାହିଁ। ଉତ୍ପାଦନ ସେବା ଯୋଡିଲେ ସୁରକ୍ଷିତ ସର୍ଭର ଡ୍ରାଫ୍ଟ ପ୍ରିଭ୍ୟୁ ଏବଂ ପୁଣି ଆରମ୍ଭ ପାଇଁ ସର୍ବାଧିକ ୭ ଦିନ ରଖିବ।",
    privacyTitle: "ଆପଣଙ୍କ ତଥ୍ୟ ବ୍ୟକ୍ତିଗତ ରହିବ",
    latinConfirmLabel: "ଗଣନା ପାଇଁ ଏହି ଲାଟିନ ବନାନ ବ୍ୟବହାର କରାଯିବ ବୋଲି ମୁଁ ନିଶ୍ଚିତ କରୁଛି।",
    latinSpellingHint: "ଆପଣଙ୍କ ଦେଖାଯାଉଥିବା ନାମ ବଦଳିବ ନାହିଁ। ଏହି ଅଲଗା ବନାନ କେବଳ ଗଣନା ଇନପୁଟକୁ ସ୍ପଷ୍ଟ କରେ।",
    latinSpellingLabel: "ଗଣନା ପାଇଁ ଲାଟିନ ବନାନ",
    marketingConsentLabel: "ବୈକଳ୍ପିକ: ଇମେଲରେ ବେଳେବେଳେ ଉତ୍ପାଦ ଖବର ଏବଂ ଅଫର ପଠାନ୍ତୁ।",
    privacyAgeLabel: "୧୮+ ନିୟମ।",
    privacyBreachLabel: "ତଥ୍ୟ ଉଲ୍ଲଂଘନ ଯୋଗାଯୋଗ।",
    privacyBreachBody: "ଆବଶ୍ୟକ ହେଲେ ଗୋପନୀୟତା ଡେସ୍କ ପ୍ରଭାବିତ ଲୋକଙ୍କୁ ବିଳମ୍ବ ନକରି ସୂଚନା ଦେବ।",
    privacyGrievanceLabel: "ଅଭିଯୋଗ।",
    privacyLocaleGate: "ସମ୍ପୂର୍ଣ୍ଣ ଗୋପନୀୟତା ସୂଚନା ବର୍ତ୍ତମାନ ଇଂରାଜୀରେ ଉପଲବ୍ଧ। ସମ୍ମତି ଦେବାକୁ ଦୟାକରି ଇଂରାଜୀ ବାଛନ୍ତୁ।",
    privacyRightsLabel: "ଆପଣଙ୍କ ଅଧିକାର ଏବଂ ବିକଳ୍ପ।",
    reviewBody: "ଆପଣ ଯେପରି ବ୍ୟାଖ୍ୟା ଚାହାନ୍ତି ସେହିପରି ତଥ୍ୟ ଯାଞ୍ଚ କରନ୍ତୁ। ଯେକୌଣସି ଉତ୍ତର ବଦଳାଇବାକୁ ପଛକୁ ଯାଇପାରିବେ।",
    reviewTitle: "ଆପଣଙ୍କ ତଥ୍ୟ ଯାଞ୍ଚ କରନ୍ତୁ",
    saveStatus: "ଫର୍ମରେ ଆପଣଙ୍କ ସ୍ଥାନ ଏହି ବ୍ରାଉଜର ସେସନରେ ୨୪ ଘଣ୍ଟା ପାଇଁ ମନେ ରଖାଯାଏ।",
    scientificNote: "ସଂଖ୍ୟାଶାସ୍ତ୍ର ଏକ ଚିନ୍ତନଶୀଳ ପରମ୍ପରା, ବୈଜ୍ଞାନିକ ଭବିଷ୍ୟବାଣୀ କିମ୍ବା ବୃତ୍ତିଗତ ପରାମର୍ଶ ନୁହେଁ।",
    startOverLabel: "ପୁଣି ଆରମ୍ଭ କରନ୍ତୁ",
    stepLabels: {
      "birth-date": "ଜନ୍ମ ତାରିଖ",
      delivery: "ଡେଲିଭରି",
      name: "ନାମ",
      preview: "ପ୍ରିଭ୍ୟୁ",
      review: "ଯାଞ୍ଚ",
    },
    title: "ଆପଣଙ୍କ ନାମ କୁହନ୍ତୁ",
    birthNameLabel: "ଆପଣଙ୍କ ଜନ୍ମ ନାମ",
    consentLabel: "ଆବଶ୍ୟକ: ମୁଁ ଗୋପନୀୟତା ସୂଚନା ପଢ଼ିଛି ଏବଂ ଏହି ରିପୋର୍ଟ ତିଆରି ପାଇଁ ମୋର ତଥ୍ୟ ପ୍ରକ୍ରିୟାକରଣରେ ସମ୍ମତ।",
    yConsonantLabel: "Y ବ୍ୟଞ୍ଜନ ଭଳି ଶୁଣାଯାଏ",
    yHint: "ଉଚ୍ଚାରଣ ଅନୁସାରେ Y ସ୍ୱର କିମ୍ବା ବ୍ୟଞ୍ଜନ ହୋଇପାରେ। ଏହି ସ୍ଥାନ ପାଇଁ ବାଛନ୍ତୁ; ଆମେ ଅନୁମାନ କରିବୁ ନାହିଁ।",
    yTitle: "ଏହି Y କୁ କିପରି ଗଣନା କରିବା?",
    yVowelLabel: "Y ସ୍ୱର ଭଳି ଶୁଣାଯାଏ",
    intakeEyebrow: "ବ୍ୟକ୍ତିଗତ ତଥ୍ୟ · ପ୍ରାୟ ୪ ମିନିଟ",
    noScriptNotice: "ଇଣ୍ଟରାକ୍ଟିଭ ଫର୍ମ ପାଇଁ JavaScript ସକ୍ଷମ କରନ୍ତୁ। ଏହି ବ୍ରାଉଜରରେ କୌଣସି ଉତ୍ତର ସଞ୍ଚିତ ହୁଏ ନାହିଁ।",
    previewHandoff: "ଏହି ତଥ୍ୟ ନିଶ୍ଚିତ କରିବା ପରେ ସୁରକ୍ଷିତ ଗଣନା ଆରମ୍ଭ ହେବ।",
  },
};

const progressStorageKey = "numbered-life:intake-progress";

interface IntakeValues {
  analyticsConsent: boolean;
  birthName: string;
  currentName: string;
  dateOfBirth: string;
  email: string;
  marketingConsent: boolean;
  consent: boolean;
}

interface NamePolicy {
  birthNameEngineLatin: string;
  birthNameEngineLatinConfirmed: boolean;
  birthNameYClassifications: Record<string, "vowel" | "consonant">;
  currentNameEngineLatin: string;
  currentNameEngineLatinConfirmed: boolean;
  currentNameYClassifications: Record<string, "vowel" | "consonant">;
}

const emptyValues: IntakeValues = {
  analyticsConsent: false,
  birthName: "",
  currentName: "",
  dateOfBirth: "",
  email: "",
  marketingConsent: false,
  consent: false,
};

export interface InitialIntakeValues {
  readonly analyticsConsent?: boolean;
  readonly birthName?: string;
  readonly birthNameEngineLatin?: string;
  readonly birthNameEngineLatinConfirmed?: boolean;
  readonly birthNameYClassifications?: Readonly<Record<string, "vowel" | "consonant">>;
  /** @deprecated Use birthNameYClassifications for occurrence-level policy. */
  readonly birthNameYClassification?: "vowel" | "consonant";
  readonly consent?: boolean;
  readonly currentName?: string;
  readonly currentNameEngineLatin?: string;
  readonly currentNameEngineLatinConfirmed?: boolean;
  readonly currentNameYClassifications?: Readonly<Record<string, "vowel" | "consonant">>;
  /** @deprecated Use currentNameYClassifications for occurrence-level policy. */
  readonly currentNameYClassification?: "vowel" | "consonant";
  readonly dateOfBirth?: string;
  readonly email?: string;
  readonly marketingConsent?: boolean;
}

function nextStep(step: IntakeStep): IntakeStep {
  const index = intakeSteps.indexOf(step);
  return intakeSteps[Math.min(index + 1, intakeSteps.length - 1)] ?? "preview";
}

function previousStep(step: IntakeStep): IntakeStep {
  const index = intakeSteps.indexOf(step);
  return intakeSteps[Math.max(index - 1, 0)] ?? "name";
}

function yClassificationsAreComplete(
  name: string,
  engineLatin: string,
  classifications: Readonly<Record<string, "vowel" | "consonant">>,
): boolean {
  return yOccurrences(name, engineLatin).every(
    (index) => classifications[String(index)] !== undefined,
  );
}

function stepIsComplete(
  step: IntakeStep,
  values: IntakeValues,
  namePolicy: NamePolicy,
  asOfDate: string,
): boolean {
  if (step === "name") {
    const namesArePresent =
      values.birthName.trim().length > 0 && values.currentName.trim().length > 0;
    const latinBranchesAreComplete =
      (!needsLatinSpelling(values.birthName) ||
        (namePolicy.birthNameEngineLatin.trim().length > 0 &&
          namePolicy.birthNameEngineLatinConfirmed === true)) &&
      (!needsLatinSpelling(values.currentName) ||
        (namePolicy.currentNameEngineLatin.trim().length > 0 &&
          namePolicy.currentNameEngineLatinConfirmed === true));
    const yBranchesAreComplete =
      yClassificationsAreComplete(
        values.birthName,
        namePolicy.birthNameEngineLatin,
        namePolicy.birthNameYClassifications,
      ) &&
      yClassificationsAreComplete(
        values.currentName,
        namePolicy.currentNameEngineLatin,
        namePolicy.currentNameYClassifications,
      );
    return namesArePresent && latinBranchesAreComplete && yBranchesAreComplete;
  }
  if (step === "birth-date") {
    return validateAdultBirthDate(values.dateOfBirth, asOfDate) === null;
  }
  if (step === "delivery") return values.email.trim().length > 0 && values.consent;
  return true;
}

export function IntakeForm({
  asOfDate,
  initialStep = "name",
  initialValues,
  locale,
  resumeFromSession = true,
}: Readonly<{
  asOfDate: string;
  initialStep?: IntakeStep;
  initialValues?: InitialIntakeValues;
  locale: IntakeLocale;
  resumeFromSession?: boolean;
}>) {
  const strings = copy[locale];
  const notice = getPrivacyNotice(locale);
  const [requestedStep, setStep] = useState<IntakeStep>(initialStep);
  const [values, setValues] = useState<IntakeValues>(() => ({
    ...emptyValues,
    analyticsConsent: initialValues?.analyticsConsent ?? false,
    birthName: initialValues?.birthName ?? "",
    currentName: initialValues?.currentName ?? "",
    dateOfBirth: initialValues?.dateOfBirth ?? "",
    email: initialValues?.email ?? "",
    marketingConsent: initialValues?.marketingConsent ?? false,
    consent: initialValues?.consent ?? false,
  }));
  const [namePolicy, setNamePolicy] = useState<NamePolicy>(() => {
    const birthName = initialValues?.birthName ?? "";
    const currentName = initialValues?.currentName ?? "";
    const birthNameYClassifications = {
      ...(initialValues?.birthNameYClassifications ?? {}),
    };
    const currentNameYClassifications = {
      ...(initialValues?.currentNameYClassifications ?? {}),
    };
    const birthYIndex = yOccurrences(birthName, initialValues?.birthNameEngineLatin)[0];
    const currentYIndex = yOccurrences(currentName, initialValues?.currentNameEngineLatin)[0];
    if (
      initialValues?.birthNameYClassification !== undefined &&
      birthYIndex !== undefined &&
      birthNameYClassifications[String(birthYIndex)] === undefined
    ) {
      birthNameYClassifications[String(birthYIndex)] = initialValues.birthNameYClassification;
    }
    if (
      initialValues?.currentNameYClassification !== undefined &&
      currentYIndex !== undefined &&
      currentNameYClassifications[String(currentYIndex)] === undefined
    ) {
      currentNameYClassifications[String(currentYIndex)] = initialValues.currentNameYClassification;
    }
    const initialPolicy: NamePolicy = {
      birthNameEngineLatin: initialValues?.birthNameEngineLatin ?? "",
      birthNameEngineLatinConfirmed: initialValues?.birthNameEngineLatinConfirmed ?? false,
      birthNameYClassifications,
      currentNameEngineLatin: initialValues?.currentNameEngineLatin ?? "",
      currentNameEngineLatinConfirmed: initialValues?.currentNameEngineLatinConfirmed ?? false,
      currentNameYClassifications,
    };
    return initialPolicy;
  });

  const birthDateError =
    values.dateOfBirth.length === 0 ? null : validateAdultBirthDate(values.dateOfBirth, asOfDate);

  // URLs and browser markers express a preference, never evidence of completed answers.
  const step =
    intakeSteps
      .slice(0, intakeSteps.indexOf(requestedStep))
      .find(
        (candidate) =>
          !stepIsComplete(candidate, values, namePolicy, asOfDate) ||
          (candidate === "delivery" && locale !== "en-IN"),
      ) ?? requestedStep;

  useEffect(() => {
    if (!resumeFromSession) return;
    try {
      const saved = window.sessionStorage.getItem(progressStorageKey);
      const progress = saved === null ? null : decodeIntakeProgress(saved, new Date());
      if (progress?.locale === locale) setStep(progress.step);
    } catch {
      // Storage is an enhancement. The form remains usable when it is blocked.
    }
  }, [locale, resumeFromSession]);

  useEffect(() => {
    try {
      window.sessionStorage.setItem(
        progressStorageKey,
        encodeIntakeProgress({ locale, savedAt: new Date().toISOString(), step }),
      );
    } catch {
      // Storage is an enhancement. The server remains authoritative for answers.
    }
  }, [locale, step]);

  function updateValue<K extends keyof IntakeValues>(key: K, value: IntakeValues[K]) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  function advance(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (step === "delivery" && locale !== "en-IN") return;
    if (!stepIsComplete(step, values, namePolicy, asOfDate)) return;
    setStep(nextStep(step));
  }

  function clearProgress() {
    try {
      window.sessionStorage.removeItem(progressStorageKey);
    } catch {
      // Nothing to clear when storage is unavailable.
    }
    setStep("name");
    setValues(emptyValues);
    setNamePolicy({
      birthNameEngineLatin: "",
      birthNameEngineLatinConfirmed: false,
      birthNameYClassifications: {},
      currentNameEngineLatin: "",
      currentNameEngineLatinConfirmed: false,
      currentNameYClassifications: {},
    });
  }

  return (
    <div className="intakeShell">
      <header className="intakeHeader">
        <a className="brand" href="/" aria-label="The Numbered Life home">
          <span aria-hidden="true" className="brandMark">
            9
          </span>
          The Numbered Life
        </a>
        <p className="intakePrice">₹499 once · web + PDF</p>
      </header>

      <div className="intakeLayout">
        <aside className="intakeAside">
          <p className="eyebrow">{strings.intakeEyebrow}</p>
          <h1>{strings.title}</h1>
          <p className="intakeIntro">{strings.intro}</p>
          <p className="intakeSaveStatus" aria-live="polite">
            {strings.saveStatus}
          </p>
          <section className="intakePrivacy" aria-labelledby="privacy-title">
            <p className="intakePrivacyIcon" aria-hidden="true">
              ◌
            </p>
            <h2 id="privacy-title">{strings.privacyTitle}</h2>
            <p>{strings.privacyBody}</p>
            <details className="privacyNotice">
              <summary>{notice.title}</summary>
              <p>{notice.intro}</p>
              <dl>
                {notice.items.map((item) => (
                  <div key={item.label}>
                    <dt>{item.label}</dt>
                    <dd>{item.body}</dd>
                  </div>
                ))}
              </dl>
              <p>
                <strong>{strings.privacyRightsLabel}</strong> {notice.rights}
              </p>
              <p>
                <strong>{strings.privacyGrievanceLabel}</strong> {notice.grievance}
              </p>
              <p>
                <strong>{strings.privacyBreachLabel}</strong> {notice.contact}{" "}
                {strings.privacyBreachBody}
              </p>
              <p>
                <strong>{strings.privacyAgeLabel}</strong> {notice.eighteenPlus}
              </p>
            </details>
          </section>
          <p className="intakeScientificNote">{strings.scientificNote}</p>
        </aside>

        <section className="intakeCard" aria-labelledby="intake-question-title">
          <nav aria-label="Intake progress" className="intakeProgress">
            <ol>
              {intakeSteps.map((candidate, index) => {
                const currentIndex = intakeSteps.indexOf(step);
                const complete = index < currentIndex;
                return (
                  <li key={candidate} data-current={candidate === step} data-complete={complete}>
                    <button
                      type="button"
                      onClick={() => {
                        if (complete) setStep(candidate);
                      }}
                      disabled={!complete && candidate !== step}
                      aria-current={candidate === step ? "step" : undefined}
                    >
                      <span aria-hidden="true">{complete ? "✓" : index + 1}</span>
                      {strings.stepLabels[candidate]}
                    </button>
                  </li>
                );
              })}
            </ol>
          </nav>

          <form aria-label="Report intake" className="intakeForm" method="post" onSubmit={advance}>
            {step === "name" && (
              <fieldset>
                <legend id="intake-question-title">{strings.nameLabel}</legend>
                <p className="fieldHint">{strings.nameHint}</p>
                <label>
                  {strings.birthNameLabel}
                  <input
                    autoComplete="name"
                    name="birthName"
                    value={values.birthName}
                    onChange={(event) => updateValue("birthName", event.target.value)}
                    required
                  />
                </label>
                {needsLatinSpelling(values.birthName) && (
                  <fieldset className="intakeConditional" aria-labelledby="birth-latin-title">
                    <legend id="birth-latin-title">{strings.latinSpellingLabel}</legend>
                    <p className="fieldHint">{strings.latinSpellingHint}</p>
                    <label>
                      {strings.latinSpellingLabel}
                      <input
                        autoComplete="off"
                        name="birthName.engineLatin"
                        value={namePolicy.birthNameEngineLatin}
                        onChange={(event) =>
                          setNamePolicy((current) => ({
                            ...current,
                            birthNameEngineLatin: event.target.value,
                          }))
                        }
                        required
                      />
                    </label>
                    <label className="checkboxLabel">
                      <input
                        name="birthName.engineLatinConfirmed"
                        type="checkbox"
                        checked={namePolicy.birthNameEngineLatinConfirmed}
                        onChange={(event) =>
                          setNamePolicy((current) => ({
                            ...current,
                            birthNameEngineLatinConfirmed: event.target.checked,
                          }))
                        }
                        required
                      />
                      <span>{strings.latinConfirmLabel}</span>
                    </label>
                  </fieldset>
                )}
                {yOccurrences(values.birthName, namePolicy.birthNameEngineLatin).map((index) => (
                  <fieldset
                    className="intakeConditional"
                    aria-labelledby={`birth-y-title-${index}`}
                    key={`birth-y-${index}`}
                  >
                    <legend id={`birth-y-title-${index}`}>
                      {strings.yTitle} ({index + 1})
                    </legend>
                    <p className="fieldHint">{strings.yHint}</p>
                    <label className="radioLabel">
                      <input
                        name={`birthName.yClassification.${index}`}
                        type="radio"
                        value="vowel"
                        checked={namePolicy.birthNameYClassifications[String(index)] === "vowel"}
                        onChange={() =>
                          setNamePolicy((current) => ({
                            ...current,
                            birthNameYClassifications: {
                              ...current.birthNameYClassifications,
                              [String(index)]: "vowel",
                            },
                          }))
                        }
                        required
                      />
                      <span>{strings.yVowelLabel}</span>
                    </label>
                    <label className="radioLabel">
                      <input
                        name={`birthName.yClassification.${index}`}
                        type="radio"
                        value="consonant"
                        checked={
                          namePolicy.birthNameYClassifications[String(index)] === "consonant"
                        }
                        onChange={() =>
                          setNamePolicy((current) => ({
                            ...current,
                            birthNameYClassifications: {
                              ...current.birthNameYClassifications,
                              [String(index)]: "consonant",
                            },
                          }))
                        }
                        required
                      />
                      <span>{strings.yConsonantLabel}</span>
                    </label>
                  </fieldset>
                ))}
                <label>
                  {strings.currentNameLabel}
                  <input
                    autoComplete="additional-name"
                    name="currentName"
                    value={values.currentName}
                    onChange={(event) => updateValue("currentName", event.target.value)}
                    required
                  />
                </label>
                {needsLatinSpelling(values.currentName) && (
                  <fieldset className="intakeConditional" aria-labelledby="current-latin-title">
                    <legend id="current-latin-title">{strings.latinSpellingLabel}</legend>
                    <p className="fieldHint">{strings.latinSpellingHint}</p>
                    <label>
                      {strings.latinSpellingLabel}
                      <input
                        autoComplete="off"
                        name="currentName.engineLatin"
                        value={namePolicy.currentNameEngineLatin}
                        onChange={(event) =>
                          setNamePolicy((current) => ({
                            ...current,
                            currentNameEngineLatin: event.target.value,
                          }))
                        }
                        required
                      />
                    </label>
                    <label className="checkboxLabel">
                      <input
                        name="currentName.engineLatinConfirmed"
                        type="checkbox"
                        checked={namePolicy.currentNameEngineLatinConfirmed}
                        onChange={(event) =>
                          setNamePolicy((current) => ({
                            ...current,
                            currentNameEngineLatinConfirmed: event.target.checked,
                          }))
                        }
                        required
                      />
                      <span>{strings.latinConfirmLabel}</span>
                    </label>
                  </fieldset>
                )}
                {yOccurrences(values.currentName, namePolicy.currentNameEngineLatin).map(
                  (index) => (
                    <fieldset
                      className="intakeConditional"
                      aria-labelledby={`current-y-title-${index}`}
                      key={`current-y-${index}`}
                    >
                      <legend id={`current-y-title-${index}`}>
                        {strings.yTitle} ({index + 1})
                      </legend>
                      <p className="fieldHint">{strings.yHint}</p>
                      <label className="radioLabel">
                        <input
                          name={`currentName.yClassification.${index}`}
                          type="radio"
                          value="vowel"
                          checked={
                            namePolicy.currentNameYClassifications[String(index)] === "vowel"
                          }
                          onChange={() =>
                            setNamePolicy((current) => ({
                              ...current,
                              currentNameYClassifications: {
                                ...current.currentNameYClassifications,
                                [String(index)]: "vowel",
                              },
                            }))
                          }
                          required
                        />
                        <span>{strings.yVowelLabel}</span>
                      </label>
                      <label className="radioLabel">
                        <input
                          name={`currentName.yClassification.${index}`}
                          type="radio"
                          value="consonant"
                          checked={
                            namePolicy.currentNameYClassifications[String(index)] === "consonant"
                          }
                          onChange={() =>
                            setNamePolicy((current) => ({
                              ...current,
                              currentNameYClassifications: {
                                ...current.currentNameYClassifications,
                                [String(index)]: "consonant",
                              },
                            }))
                          }
                          required
                        />
                        <span>{strings.yConsonantLabel}</span>
                      </label>
                    </fieldset>
                  ),
                )}
              </fieldset>
            )}

            {step === "birth-date" && (
              <fieldset>
                <legend id="intake-question-title">{strings.birthDateLabel}</legend>
                <p className="fieldHint" id="birth-date-hint">
                  {strings.dateHint}
                </p>
                <label>
                  {strings.birthDateLabel}
                  <input
                    aria-describedby="birth-date-hint birth-date-error"
                    aria-invalid={birthDateError !== null}
                    autoComplete="bday"
                    max={asOfDate}
                    name="dateOfBirth"
                    type="date"
                    value={values.dateOfBirth}
                    onChange={(event) => updateValue("dateOfBirth", event.target.value)}
                    required
                  />
                </label>
                {birthDateError !== null && (
                  <p className="intakeError" id="birth-date-error" role="alert">
                    {birthDateError === "underage"
                      ? strings.birthDateUnderageError
                      : strings.birthDateInvalidError}
                  </p>
                )}
              </fieldset>
            )}

            {step === "delivery" && (
              <fieldset>
                <legend id="intake-question-title">{strings.deliveryLabel}</legend>
                <p className="fieldHint">{strings.deliveryLabel}</p>
                <label>
                  {strings.emailLabel}
                  <input
                    autoComplete="email"
                    inputMode="email"
                    name="email"
                    type="email"
                    value={values.email}
                    onChange={(event) => updateValue("email", event.target.value)}
                    required
                  />
                </label>
                {locale === "en-IN" ? (
                  <>
                    <label className="checkboxLabel">
                      <input
                        name="requiredProcessing"
                        type="checkbox"
                        checked={values.consent}
                        onChange={(event) => updateValue("consent", event.target.checked)}
                        required
                      />
                      <span>{strings.consentLabel}</span>
                    </label>
                    <label className="checkboxLabel">
                      <input
                        name="analyticsConsent"
                        type="checkbox"
                        checked={values.analyticsConsent}
                        onChange={(event) => updateValue("analyticsConsent", event.target.checked)}
                      />
                      <span>{strings.analyticsConsentLabel}</span>
                    </label>
                    <label className="checkboxLabel">
                      <input
                        name="marketingConsent"
                        type="checkbox"
                        checked={values.marketingConsent}
                        onChange={(event) => updateValue("marketingConsent", event.target.checked)}
                      />
                      <span>{strings.marketingConsentLabel}</span>
                    </label>
                  </>
                ) : (
                  <p className="intakeError" role="alert">
                    {strings.privacyLocaleGate}
                  </p>
                )}
              </fieldset>
            )}

            {step === "review" && (
              <fieldset>
                <legend id="intake-question-title">{strings.reviewTitle}</legend>
                <p className="fieldHint">{strings.reviewBody}</p>
                <dl className="intakeReview">
                  <div>
                    <dt>{strings.birthNameLabel}</dt>
                    <dd>{values.birthName || "—"}</dd>
                  </div>
                  <div>
                    <dt>{strings.currentNameLabel}</dt>
                    <dd>{values.currentName || "—"}</dd>
                  </div>
                  <div>
                    <dt>{strings.birthDateLabel}</dt>
                    <dd>{values.dateOfBirth || "—"}</dd>
                  </div>
                  <div>
                    <dt>{strings.emailLabel}</dt>
                    <dd>{values.email || "—"}</dd>
                  </div>
                </dl>
              </fieldset>
            )}

            {step === "preview" && (
              <fieldset>
                <legend id="intake-question-title">{strings.previewTitle}</legend>
                <p className="fieldHint">{strings.previewBody}</p>
                <div className="previewHandoff" role="status">
                  <p className="eyebrow">{strings.previewLabel}</p>
                  <div className="previewSkeleton" aria-hidden="true">
                    <span />
                    <span />
                    <span />
                  </div>
                  <p>{strings.previewHandoff}</p>
                </div>
              </fieldset>
            )}

            <div className="intakeActions">
              {step !== "name" && (
                <button
                  className="textButton"
                  type="button"
                  onClick={() => setStep(previousStep(step))}
                >
                  ← {strings.backLabel}
                </button>
              )}
              {step !== "preview" ? (
                <button className="button" onClick={() => advance()} type="button">
                  {step === "review" ? strings.continueLabel : strings.nextLabel}{" "}
                  <span aria-hidden="true">→</span>
                </button>
              ) : (
                <button className="textButton" type="button" onClick={clearProgress}>
                  {strings.startOverLabel}
                </button>
              )}
            </div>
          </form>
          <noscript>
            <p className="noscriptNotice">{strings.noScriptNotice}</p>
          </noscript>
        </section>
      </div>
    </div>
  );
}
