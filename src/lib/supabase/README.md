# Supabase authentication — Phase 3

`config.ts` reads only `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. It validates missing configuration and the publishable key prefix without printing values. No secret or service-role key is used.

`client.ts` creates the official browser SSR client. Forms call `signUp`, `signInWithPassword`, `resend({ type: "signup" })`, and `signOut({ scope: "local" })` from the browser. The SDK stores the session in cookies. The resend form requests a new PKCE confirmation link only on submission, has a 60-second retry cooldown, and displays Supabase sender rate-limit errors.

`server.ts` creates a new cookie-aware client per server request. `getUser()` verifies identity in the protected layout and chat/document APIs. Authorization never trusts the unverified user object from `getSession()`.

`middleware.ts` uses `getClaims()` to verify/refresh sessions before rendering. Cookie writes go to both the incoming request and outgoing response. Redirects and 401 responses preserve refreshed cookies and no-cache headers. `src/middleware.ts` selects the routes; this Next.js 15 project uses middleware rather than the Next.js 16 proxy filename.

The protected route group changes organization, not URLs. `/`, `/chat`, and `/documents` require authentication. `/login`, `/signup`, and `/auth/callback` are public. The callback exchanges a PKCE confirmation code for a session and redirects only to an allowed local page.

Supabase's own Auth service manages authentication records. Phase 3 added only email/password authentication. Phase 4 adds the private `documents` bucket and owner policies in `supabase/storage/documents.sql`. There are still no application/profile tables. Document requests use this same server client with the authenticated user's normal session, so Storage RLS remains active. No service-role key is used, and project billing/paid features are untouched.

Allow the development callback URL in Supabase Auth URL Configuration. Keep email confirmation enabled and use a project organization member email with the default sender; no paid SMTP or customized template is required. Open the confirmation link in the same browser where sign-up started, which holds the PKCE verifier cookie.
