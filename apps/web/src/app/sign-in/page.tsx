import { SignInForm } from "../../auth/sign-in-form";
export const metadata = {
  title: "Sign in | The Numbered Life",
  robots: { index: false, follow: false },
  referrer: "no-referrer" as const,
};
export default function SignInPage() {
  return <SignInForm />;
}
