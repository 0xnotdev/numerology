"use client";
import { readIntakeCsrf } from "./intake-client";
export function LogoutButton() {
  async function logout() {
    const csrf = readIntakeCsrf();
    if (!csrf) return window.location.assign("/sign-in");
    const response = await fetch("/api/v1/auth/logout", {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      headers: { "X-CSRF-Token": csrf },
    });
    if (response.ok) window.location.assign("/");
  }
  return (
    <button className="textButton" type="button" onClick={() => void logout()}>
      Sign out
    </button>
  );
}
