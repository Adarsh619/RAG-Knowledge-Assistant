import { getCurrentUser } from "@/lib/supabase/server";
import { handleChatRequest } from "@/lib/ai/chat-handler";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return Response.json(
      { error: "Sign in to use chat." },
      {
        status: 401,
        headers: { "Cache-Control": "private, no-store" },
      },
    );
  }
  return handleChatRequest(request);
}
