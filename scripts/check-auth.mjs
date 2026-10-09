import assert from "node:assert/strict";
import test from "node:test";
import { generateKeyPairSync, sign } from "node:crypto";
import { createServerClient } from "@supabase/ssr";
import { NextRequest } from "next/server.js";
import { updateSession } from "../src/lib/supabase/middleware.ts";
import { getSafeNextPath } from "../src/lib/auth/redirect.ts";

test("Supabase session and route checks using an offline Auth fixture", async (t) => {
  const previousFetch = globalThis.fetch;
  const previousUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const previousKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const projectUrl = "https://supabase.test";
  const publishableKey = "sb_publishable_offline_test_fixture";
  process.env.NEXT_PUBLIC_SUPABASE_URL = projectUrl;
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = publishableKey;

  // These keys are generated locally for fixture JWT verification, not project keys.
  const { privateKey, publicKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
  });
  const kid = "offline-fixture-signing-key";
  const jwk = {
    ...publicKey.export({ format: "jwk" }),
    kid,
    alg: "RS256",
    use: "sig",
  };
  const user = {
    id: "00000000-0000-4000-8000-000000000001",
    email: "learner@example.test",
    aud: "authenticated",
    role: "authenticated",
    app_metadata: { provider: "email", providers: ["email"] },
    user_metadata: {},
    created_at: "2026-01-01T00:00:00Z",
  };
  let generation = 0;
  function session() {
    generation += 1;
    const now = Math.floor(Date.now() / 1000);
    const header = Buffer.from(
      JSON.stringify({ alg: "RS256", typ: "JWT", kid }),
    ).toString("base64url");
    const payload = Buffer.from(
      JSON.stringify({
        iss: `${projectUrl}/auth/v1`,
        sub: user.id,
        aud: "authenticated",
        role: "authenticated",
        email: user.email,
        iat: now,
        exp: now + 3600,
      }),
    ).toString("base64url");
    const input = `${header}.${payload}`;
    return {
      access_token: `${input}.${sign("RSA-SHA256", Buffer.from(input), privateKey).toString("base64url")}`,
      refresh_token: `offline-refresh-${generation}`,
      token_type: "bearer",
      expires_in: 3600,
      expires_at: now + 3600,
      user,
    };
  }
  let fixtureRequests = 0;
  let unexpectedRequests = 0;
  let lastResend = null;
  globalThis.fetch = async (input, options) => {
    const request = new Request(input, options);
    const url = new URL(request.url);
    if (url.origin !== projectUrl || !url.pathname.startsWith("/auth/v1/")) {
      unexpectedRequests += 1;
      throw new Error("A non-fixture request was blocked before network I/O.");
    }
    fixtureRequests += 1;
    if (url.pathname.endsWith("/.well-known/jwks.json"))
      return Response.json({ keys: [jwk] });
    if (url.pathname.endsWith("/signup")) return Response.json(user);
    if (url.pathname.endsWith("/resend")) {
      lastResend = {
        body: await request.json(),
        redirectTo: url.searchParams.get("redirect_to"),
      };
      if (lastResend.body.email === "rate-limited@example.test") {
        return Response.json(
          {
            code: "over_email_send_rate_limit",
            msg: "Email rate limit exceeded",
          },
          { status: 429, headers: { "X-Supabase-Api-Version": "2024-01-01" } },
        );
      }
      return Response.json({});
    }
    if (url.pathname.endsWith("/token")) {
      const body = await request.json();
      if (
        url.searchParams.get("grant_type") === "password" &&
        body.password !== "offline-test-password"
      ) {
        return Response.json(
          { code: "invalid_credentials", msg: "Invalid login credentials" },
          { status: 400, headers: { "X-Supabase-Api-Version": "2024-01-01" } },
        );
      }
      return Response.json(session());
    }
    if (url.pathname.endsWith("/user")) return Response.json(user);
    if (url.pathname.endsWith("/logout"))
      return new Response(null, { status: 204 });
    throw new Error("Unexpected Auth fixture endpoint.");
  };

  const cookieJar = new Map();
  let latestCookieHeaders = {};
  function client() {
    return createServerClient(projectUrl, publishableKey, {
      cookies: {
        getAll: () => [...cookieJar].map(([name, value]) => ({ name, value })),
        setAll(cookies, headers) {
          latestCookieHeaders = headers;
          for (const { name, value, options } of cookies) {
            if (options.maxAge === 0 || !value) cookieJar.delete(name);
            else cookieJar.set(name, value);
          }
        },
      },
    });
  }
  function pageRequest(path, authenticated = false) {
    const cookie = authenticated
      ? [...cookieJar].map(([name, value]) => `${name}=${value}`).join("; ")
      : "";
    return new NextRequest(`http://localhost:3000${path}`, {
      headers: { cookie },
    });
  }

  try {
    await t.test("safe return paths reject external destinations", () => {
      for (const value of [
        "https://example.com",
        "//example.com",
        "/\\example.com",
        "/login",
        undefined,
      ])
        assert.equal(getSafeNextPath(value), "/");
      assert.equal(getSafeNextPath("/chat"), "/chat");
      assert.equal(getSafeNextPath("/documents"), "/documents");
    });

    await t.test("signed-out protected pages redirect to login", async () => {
      for (const path of ["/", "/chat", "/documents"]) {
        const response = await updateSession(pageRequest(path));
        assert.equal(response.status, 307);
        const location = new URL(response.headers.get("Location"));
        assert.equal(location.pathname, "/login");
        assert.equal(location.searchParams.get("next"), path);
        assert.match(response.headers.get("Cache-Control"), /no-store/);
      }
    });

    await t.test(
      "signed-out chat and documents APIs return JSON 401",
      async () => {
        for (const [path, message] of [
          ["/api/chat", "Sign in to use chat."],
          ["/api/documents", "Sign in to manage documents."],
          ["/api/documents/extract", "Sign in to manage documents."],
          ["/api/documents/embed", "Sign in to manage documents."],
        ]) {
          const response = await updateSession(pageRequest(path));
          assert.equal(response.status, 401);
          assert.equal((await response.json()).error, message);
        }
      },
    );

    await t.test(
      "sign-up can require confirmation without creating a session",
      async () => {
        const { data, error } = await client().auth.signUp({
          email: user.email,
          password: "offline-test-password",
          options: { emailRedirectTo: "http://localhost:3000/auth/callback" },
        });
        assert.equal(error, null);
        assert.equal(data.session, null);
        assert.equal(data.user.id, user.id);
      },
    );

    await t.test(
      "resending confirmation preserves PKCE and creates no session",
      async () => {
        const { data, error } = await client().auth.resend({
          type: "signup",
          email: user.email,
          options: {
            emailRedirectTo: "http://localhost:3000/auth/callback?next=%2Fchat",
          },
        });
        assert.equal(error, null);
        assert.equal(data.session, null);
        assert.equal(lastResend.body.type, "signup");
        assert.ok(lastResend.body.code_challenge);
        assert.equal(lastResend.body.code_challenge_method, "s256");
        assert.equal(new URL(lastResend.redirectTo).pathname, "/auth/callback");
        assert.equal(
          new URL(lastResend.redirectTo).searchParams.get("next"),
          "/chat",
        );
        assert.equal((await client().auth.getSession()).data.session, null);
      },
    );

    await t.test(
      "confirmation resend surfaces the sender rate limit",
      async () => {
        const { error } = await client().auth.resend({
          type: "signup",
          email: "rate-limited@example.test",
        });
        assert.equal(error.code, "over_email_send_rate_limit");
        assert.equal((await client().auth.getSession()).data.session, null);
      },
    );

    await t.test("invalid credentials do not create a session", async () => {
      const { error } = await client().auth.signInWithPassword({
        email: user.email,
        password: "wrong-offline-password",
      });
      assert.equal(error.code, "invalid_credentials");
      assert.equal((await client().auth.getSession()).data.session, null);
    });

    await t.test(
      "sign-in creates cookies with no-cache response headers",
      async () => {
        const { data, error } = await client().auth.signInWithPassword({
          email: user.email,
          password: "offline-test-password",
        });
        assert.equal(error, null);
        assert.equal(data.user.id, user.id);
        assert.ok(cookieJar.size > 0);
        assert.match(latestCookieHeaders["Cache-Control"], /no-store/);
      },
    );

    await t.test(
      "a new server client sees and verifies the persisted session",
      async () => {
        const { data, error } = await client().auth.getUser();
        assert.equal(error, null);
        assert.equal(data.user.id, user.id);
      },
    );

    await t.test(
      "signed-in protected pages and API are permitted",
      async () => {
        for (const path of [
          "/",
          "/chat",
          "/documents",
          "/api/chat",
          "/api/documents",
          "/api/documents/extract",
          "/api/documents/embed",
        ]) {
          const response = await updateSession(pageRequest(path, true));
          assert.equal(response.status, 200);
          assert.equal(response.headers.get("x-middleware-next"), "1");
        }
      },
    );

    await t.test(
      "signed-in auth pages redirect to a safe destination",
      async () => {
        const response = await updateSession(
          pageRequest("/login?next=/chat", true),
        );
        assert.equal(
          new URL(response.headers.get("Location")).pathname,
          "/chat",
        );
        const unsafe = await updateSession(
          pageRequest("/signup?next=https://example.com", true),
        );
        assert.equal(unsafe.headers.get("Location"), "http://localhost:3000/");
      },
    );

    await t.test(
      "a forged session token cannot access a protected page",
      async () => {
        const [name, originalValue] = [...cookieJar].find(([key]) =>
          key.endsWith("-auth-token"),
        );
        const stored = JSON.parse(
          Buffer.from(
            originalValue.slice("base64-".length),
            "base64url",
          ).toString(),
        );
        const parts = stored.access_token.split(".");
        parts[2] = (parts[2][0] === "A" ? "B" : "A") + parts[2].slice(1);
        stored.access_token = parts.join(".");
        cookieJar.set(
          name,
          "base64-" + Buffer.from(JSON.stringify(stored)).toString("base64url"),
        );
        try {
          assert.equal(
            (await updateSession(pageRequest("/documents", true))).status,
            307,
          );
        } finally {
          cookieJar.set(name, originalValue);
        }
      },
    );

    await t.test(
      "middleware carries refreshed cookies onto redirects",
      async () => {
        const [name, value] = [...cookieJar].find(([key]) =>
          key.endsWith("-auth-token"),
        );
        const stored = JSON.parse(
          Buffer.from(value.slice("base64-".length), "base64url").toString(),
        );
        stored.expires_at = Math.floor(Date.now() / 1000) - 60;
        cookieJar.set(
          name,
          "base64-" + Buffer.from(JSON.stringify(stored)).toString("base64url"),
        );
        const response = await updateSession(
          pageRequest("/login?next=/chat", true),
        );
        assert.equal(
          new URL(response.headers.get("Location")).pathname,
          "/chat",
        );
        assert.ok(response.cookies.getAll().length > 0);
        assert.match(response.headers.get("Cache-Control"), /no-store/);
        for (const cookie of response.cookies.getAll())
          cookieJar.set(cookie.name, cookie.value);
      },
    );

    await t.test(
      "session refresh updates cookies and preserves no-cache headers",
      async () => {
        const before = [...cookieJar].map(([, value]) => value).join("");
        const { error } = await client().auth.refreshSession();
        assert.equal(error, null);
        assert.notEqual(
          [...cookieJar].map(([, value]) => value).join(""),
          before,
        );
        assert.match(latestCookieHeaders["Cache-Control"], /no-store/);
      },
    );

    await t.test("sign-out removes cookies and protected access", async () => {
      assert.equal(
        (await client().auth.signOut({ scope: "local" })).error,
        null,
      );
      assert.equal((await client().auth.getSession()).data.session, null);
      assert.equal(
        (await updateSession(pageRequest("/chat", true))).status,
        307,
      );
    });

    await t.test("no real project, paid endpoint, or LLM was contacted", () => {
      assert.ok(fixtureRequests > 0);
      assert.equal(unexpectedRequests, 0);
    });
  } finally {
    globalThis.fetch = previousFetch;
    if (previousUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = previousUrl;
    if (previousKey === undefined)
      delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    else process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = previousKey;
  }
});
