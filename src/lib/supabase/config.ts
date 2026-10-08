export function getSupabaseConfig() {
  // Direct NEXT_PUBLIC references let Next.js include these public values in the browser.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const publishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!url || !publishableKey) {
    throw new Error(
      "Supabase configuration is missing. Check the two NEXT_PUBLIC_SUPABASE variables in .env.local, then restart the server.",
    );
  }
  // Reject private and legacy keys instead of accidentally sending them to the browser.
  if (!publishableKey.startsWith("sb_publishable_")) {
    throw new Error(
      "Use a Supabase publishable key for NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.",
    );
  }
  try {
    if (new URL(url).protocol !== "https:") throw new Error();
  } catch {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL must be a valid HTTPS project URL.",
    );
  }
  return { url, publishableKey };
}
