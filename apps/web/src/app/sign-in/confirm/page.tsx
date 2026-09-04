import { ConfirmSignIn } from "../../../auth/confirm-sign-in";
export const metadata = {
  title: "Confirm sign-in | The Numbered Life",
  robots: { index: false, follow: false },
  referrer: "no-referrer" as const,
};
export default function ConfirmSignInPage() {
  return <ConfirmSignIn />;
}
