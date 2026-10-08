"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import type { FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";
import { getSafeNextPath } from "@/lib/auth/redirect";
import { ResendConfirmationForm } from "./resend-confirmation-form";

export function AuthForm({
  mode,
  next,
  confirmationFailed,
}: {
  mode: "login" | "signup";
  next: string;
  confirmationFailed?: boolean;
}) {
  const submitting = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(
    confirmationFailed
      ? "The confirmation link could not be completed. Try signing in first: your email may already be confirmed. If it is still unconfirmed, request a fresh link below and open it in the same browser."
      : null,
  );
  const [success, setSuccess] = useState<string | null>(null);
  const signingUp = mode === "signup";
  const destination = getSafeNextPath(next);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    const form = event.currentTarget;
    const values = new FormData(form);
    const email = String(values.get("email") ?? "").trim();
    const password = String(values.get("password") ?? "");
    submitting.current = true;
    setPending(true);
    setError(null);
    setSuccess(null);

    try {
      const supabase = createClient();
      if (signingUp) {
        const callbackUrl = new URL("/auth/callback", window.location.origin);
        callbackUrl.searchParams.set("next", destination);
        const { data, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: callbackUrl.toString() },
        });
        if (signUpError) {
          setError(
            signUpError.code === "over_email_send_rate_limit"
              ? "The confirmation email limit was reached. Wait before trying again."
              : signUpError.code === "email_address_not_authorized"
                ? "This project's default email service only sends to project team addresses. Use your Supabase organization member email for this learning project."
                : signUpError.code === "weak_password"
                  ? "Choose a stronger password that meets the project's password policy."
                  : "Sign-up could not be completed. Check the email/password and try again. The project may restrict confirmation emails to its team members.",
          );
          return;
        }
        form.reset();
        if (!data.session) {
          setSuccess(
            "Check your email to confirm your account. Open the link in this same browser, then return here to sign in. If you already have an account, use Sign in.",
          );
          return;
        }
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (signInError) {
          setError(
            signInError.code === "email_not_confirmed"
              ? "Confirm your email before signing in. If the link expired, use Resend confirmation email below."
              : "Sign-in failed. Check your email and password, then try again.",
          );
          return;
        }
      }
      // A full navigation clears stale protected pages and reads the new auth cookies.
      window.location.assign(destination);
    } catch {
      setError(
        "Authentication could not be reached. Check your connection and Supabase configuration, then try again.",
      );
    } finally {
      setPending(false);
      submitting.current = false;
    }
  }

  return (
    <div className="panel p-7 sm:p-9">
      <p className="text-[10px] font-bold tracking-[0.18em] text-emerald-700">
        YOUR KNOWLEDGE WORKSPACE
      </p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight">
        {signingUp ? "Create your account" : "Welcome back"}
      </h1>
      <p className="mt-3 text-sm leading-6 text-slate-500">
        {signingUp
          ? "Start with an email and password. Your documents will find their home here in later phases."
          : "Sign in to your dashboard, local chat, and document workspace."}
      </p>
      <form onSubmit={handleSubmit} className="mt-7 space-y-5">
        <div>
          <label htmlFor="email" className="mb-2 block text-sm font-medium">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            disabled={pending}
            className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm disabled:bg-slate-50"
          />
        </div>
        <div>
          <label htmlFor="password" className="mb-2 block text-sm font-medium">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            minLength={signingUp ? 6 : undefined}
            autoComplete={signingUp ? "new-password" : "current-password"}
            disabled={pending}
            aria-describedby={signingUp ? "password-hint" : undefined}
            className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm disabled:bg-slate-50"
          />
          {signingUp && (
            <p id="password-hint" className="mt-2 text-xs text-slate-500">
              At least 6 characters; your project&apos;s password policy may require
              more.
            </p>
          )}
        </div>
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
          disabled={pending}
          className="primary-link w-full disabled:opacity-60"
        >
          {pending
            ? signingUp
              ? "Creating account…"
              : "Signing in…"
            : signingUp
              ? "Create account"
              : "Sign in"}
        </button>
      </form>
      <p className="mt-6 text-center text-sm text-slate-500">
        {signingUp ? "Already have an account?" : "New to Groundwork?"}{" "}
        <Link
          href={`${signingUp ? "/login" : "/signup"}?next=${encodeURIComponent(destination)}`}
          className="font-semibold text-emerald-800 hover:underline"
        >
          {signingUp ? "Sign in" : "Create an account"}
        </Link>
      </p>
      {!signingUp && <ResendConfirmationForm next={destination} />}
      <p className="mt-6 border-t border-slate-100 pt-5 text-center text-xs leading-5 text-slate-400">
        Phase 3 · Supabase email authentication
        <br />
        Chat continues to use local mock responses.
      </p>
    </div>
  );
}
