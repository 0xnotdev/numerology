import { type IntakeLocale, type IntakeStep, intakeSteps } from "./intake-progress";

const intentIdPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const supportedLocales = new Set<IntakeLocale>(["en-IN", "hi-IN", "or-IN"]);

export function parseIntakeRoute(
  locale: string,
  intentId: string,
  step: string,
): { intentId: string; locale: IntakeLocale; step: IntakeStep } | null {
  if (!supportedLocales.has(locale as IntakeLocale)) return null;
  if (!intentIdPattern.test(intentId)) return null;
  if (!intakeSteps.includes(step as IntakeStep)) return null;
  return { intentId, locale: locale as IntakeLocale, step: step as IntakeStep };
}
