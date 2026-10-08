"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function SignOutButton() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signOut() {
    setPending(true);
    setError(null);
    try {
      const { error } = await createClient().auth.signOut({ scope: "local" });
      if (error) {
        setError("Could not sign out. Please try again.");
        return;
      }
      // Reload instead of reusing cached pages belonging to the signed-in session.
      window.location.assign("/login");
    } catch {
      setError("Could not sign out. Check your connection and try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        disabled={pending}
        onClick={signOut}
        className="text-xs font-semibold text-slate-500 hover:text-emerald-800 disabled:opacity-50"
      >
        {pending ? "Signing out…" : "Sign out"}
      </button>
      {error && (
        <p role="alert" className="mt-2 max-w-40 text-xs text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
