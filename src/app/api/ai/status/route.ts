import { getCurrentUser } from "@/lib/supabase/server";
import { getAiStatus } from "@/lib/ai/status";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  const headers = { "Cache-Control": "private, no-store" };
  try {
    if (!await getCurrentUser()) return Response.json({ error: "Sign in to check local AI." }, { status: 401, headers });
    return Response.json(await getAiStatus(), { headers });
  } catch { return Response.json({ error: "Local AI status could not be checked." }, { status: 503, headers }); }
}
