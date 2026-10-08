import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server.js";
import { getSupabaseConfig } from "./config.ts";
import { getSafeNextPath, isProtectedPath } from "../auth/redirect.ts";

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const { url, publishableKey } = getSupabaseConfig();
  const supabase = createServerClient(url, publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
        Object.entries(headers).forEach(([key, value]) =>
          response.headers.set(key, value),
        );
      },
    },
  });

  // Verify immediately after creating the client, before deciding which response to send.
  const { data, error } = await supabase.auth.getClaims();
  const signedIn = !error && Boolean(data?.claims?.sub);
  response.headers.set("Cache-Control", "private, no-store");

  function withSessionCookies(nextResponse: NextResponse) {
    response.cookies
      .getAll()
      .forEach((cookie) => nextResponse.cookies.set(cookie));
    for (const header of ["cache-control", "expires", "pragma"]) {
      const value = response.headers.get(header);
      if (value) nextResponse.headers.set(header, value);
    }
    return nextResponse;
  }

  const pathname = request.nextUrl.pathname;
  if (!signedIn && pathname === "/api/chat") {
    return withSessionCookies(
      NextResponse.json({ error: "Sign in to use chat." }, { status: 401 }),
    );
  }
  if (!signedIn && isProtectedPath(pathname)) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", getSafeNextPath(pathname));
    return withSessionCookies(NextResponse.redirect(loginUrl));
  }
  if (signedIn && (pathname === "/login" || pathname === "/signup")) {
    const next = getSafeNextPath(request.nextUrl.searchParams.get("next"));
    return withSessionCookies(
      NextResponse.redirect(new URL(next, request.url)),
    );
  }
  return response;
}
