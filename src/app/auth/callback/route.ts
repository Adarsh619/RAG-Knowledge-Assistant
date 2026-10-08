import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSafeNextPath } from "@/lib/auth/redirect";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const next = getSafeNextPath(request.nextUrl.searchParams.get("next"));
  if (code) {
    try {
      const supabase = await createClient();
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error) {
        return NextResponse.redirect(new URL(next, request.url), {
          headers: { "Cache-Control": "private, no-store" },
        });
      }
    } catch {
      /* Fall through to a safe error page without logging the code. */
    }
  }
  return NextResponse.redirect(
    new URL("/login?error=confirmation", request.url),
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
