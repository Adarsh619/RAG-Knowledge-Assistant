/** Read our API contract without displaying raw HTML, network details or stack traces. */
export async function readApiResponse<T>(response: Response): Promise<T> {
  let data: unknown;
  try { data = await response.json(); }
  catch { throw new Error("The application returned an unreadable response. Refresh and try again."); }
  if (!response.ok) {
    if (response.status === 401) throw new Error("Your session has expired. Sign in again, then reopen your workspace.");
    const message = data && typeof data === "object" && "error" in data ? data.error : null;
    throw new Error(typeof message === "string" && message.length <= 1000
      ? message : "The request could not be completed. Please try again.");
  }
  if (!data || typeof data !== "object" || Array.isArray(data))
    throw new Error("The application returned an unexpected response. Refresh and try again.");
  return data as T;
}

/** Read a turn that may stream (application/x-ndjson) or answer with ordinary JSON. */
export async function readTurnResponse<T>(response: Response, onText: (text: string) => void): Promise<T> {
  if (!response.headers.get("content-type")?.startsWith("application/x-ndjson") || !response.body)
    return readApiResponse<T>(response);
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffered = "";
  for (;;) {
    const { value, done } = await reader.read();
    buffered += value ?? "";
    const lines = done ? [buffered] : buffered.split("\n");
    buffered = done ? "" : lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      let event: unknown;
      try { event = JSON.parse(line); }
      catch { throw new Error("The application returned an unreadable response. Refresh and try again."); }
      if (!event || typeof event !== "object") continue;
      const typed = event as { type?: unknown; text?: unknown; data?: unknown; status?: unknown; error?: unknown };
      if (typed.type === "delta" && typeof typed.text === "string") onText(typed.text);
      else if (typed.type === "done" && typed.data && typeof typed.data === "object" && !Array.isArray(typed.data))
        return typed.data as T;
      else if (typed.type === "error")
        throw new Error(typed.status === 401 ? "Your session has expired. Sign in again, then reopen your workspace."
          : typeof typed.error === "string" && typed.error.length <= 1000 ? typed.error
            : "The request could not be completed. Please try again.");
    }
    if (done) throw new Error("The reply stream ended unexpectedly. Refresh history to check saved messages before retrying.");
  }
}
