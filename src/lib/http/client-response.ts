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
