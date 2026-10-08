import { getLlmMode, getLlmProvider } from "../../../lib/ai/provider.ts";
import { OPENAI_DISABLED_MESSAGE } from "../../../lib/ai/providers/openai.ts";
import { MAX_MESSAGE_LENGTH } from "../../../types/chat.ts";
import type { ChatErrorResponse, ChatResponse } from "../../../types/chat.ts";

export const runtime = "nodejs";

function errorResponse(error: string, status: number) {
  return Response.json({ error } satisfies ChatErrorResponse, { status });
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("Send a valid JSON body containing a message.", 400);
  }

  if (
    !body ||
    typeof body !== "object" ||
    !("message" in body) ||
    typeof body.message !== "string"
  ) {
    return errorResponse("A message must be provided as text.", 400);
  }

  const message = body.message.trim();
  if (!message) return errorResponse("Enter a message before sending.", 400);
  if (message.length > MAX_MESSAGE_LENGTH) {
    return errorResponse(
      `Keep messages to ${MAX_MESSAGE_LENGTH} characters or fewer.`,
      400,
    );
  }

  const mode = getLlmMode();
  if (!mode) {
    return errorResponse(
      "Unsupported LLM_MODE. Set LLM_MODE=mock and restart the server.",
      503,
    );
  }
  try {
    const provider = getLlmProvider();
    // OpenAI is disabled in its server module, regardless of environment keys.
    if (!provider.enabled) return errorResponse(OPENAI_DISABLED_MESSAGE, 503);
    const content = await provider.reply(message);
    return Response.json(
      {
        mode: provider.mode,
        message: { role: "assistant", content },
      } satisfies ChatResponse,
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    // Do not return stack traces, credentials, or provider internals to the browser.
    return errorResponse(
      "The local response could not be created. Please try again.",
      500,
    );
  }
}
