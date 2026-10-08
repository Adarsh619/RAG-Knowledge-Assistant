"use client";

import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";
import { getSafeNextPath } from "@/lib/auth/redirect";

export function ResendConfirmationForm({ next }: { next: string }) {
  const submitting = useRef(false);
  const [pending, setPending] = useState(false);
  const [cooldown, setCooldown] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (!cooldown) return;
    const timer = window.setTimeout(() => setCooldown(false), 60_000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current || cooldown) return;
    const email = String(
      new FormData(event.currentTarget).get("email") ?? "",
    ).trim();
    submitting.current = true;
    setPending(true);
    setCooldown(true);
    setError(null);
    setSuccess(null);

    try {
      const callbackUrl = new URL("/auth/callback", window.location.origin);
      callbackUrl.searchParams.set("next", getSafeNextPath(next));
      const { error: resendError } = await createClient().auth.resend({
        type: "signup",
        email,
        options: { emailRedirectTo: callbackUrl.toString() },
      });
      if (resendError) {
        setError(
          resendError.code === "over_email_send_rate_limit" ||
            resendError.code === "over_request_rate_limit"
            ? "The email request limit was reached. Wait before trying again; the default sender also has an hourly limit."
            : resendError.code === "email_address_not_authorized"
              ? "This project's default email service only sends to project team addresses."
              : "The confirmation email could not be requested. Check the address and try again later.",
        );
        return;
      }
      setSuccess(
        "If this address has an unconfirmed account, a new confirmation email has been requested. Open only the newest link in this same browser. Then try signing in.",
      );
    } catch {
      setError(
        "Authentication could not be reached. Check your connection and try again later.",
      );
    } finally {
      setPending(false);
      submitting.current = false;
    }
  }

  return (
    <details className="mt-6 border-t border-slate-100 pt-5">
      <summary className="cursor-pointer text-sm font-semibold text-emerald-800">
        Resend confirmation email
      </summary>
      <p className="mt-3 text-xs leading-5 text-slate-500">
        Try signing in first. If your email is still unconfirmed, request a fresh
        link here. Older links may stop working after a new request.
      </p>
      <form onSubmit={handleSubmit} className="mt-4 space-y-3">
        <label htmlFor="confirmation-email" className="block text-sm font-medium">
          Account email
        </label>
        <input
          id="confirmation-email"
          name="email"
          type="email"
          required
          autoComplete="email"
          disabled={pending}
          className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm disabled:bg-slate-50"
        />
        {error && (
          <p
            role="alert"
            className="rounded-xl bg-red-50 p-3 text-sm leading-5 text-red-700"
          >
            {error}
          </p>
        )}
        {success && (
          <p
            role="status"
            className="rounded-xl bg-emerald-50 p-3 text-sm leading-5 text-emerald-800"
          >
            {success}
          </p>
        )}
        <button
          type="submit"
          disabled={pending || cooldown}
          className="primary-link w-full disabled:opacity-60"
        >
          {pending
            ? "Requesting email…"
            : cooldown
              ? "Wait 60 seconds before retrying"
              : "Send a new confirmation email"}
        </button>
        <p className="text-xs leading-5 text-slate-400">
          This uses the Supabase default sender and its existing rate limits.
        </p>
      </form>
    </details>
  );
}
