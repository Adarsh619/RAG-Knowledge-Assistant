import assert from "node:assert/strict";
import test from "node:test";
import { parseTheme, resolveTheme, documentChatHref, parseDocumentScope } from "../src/lib/ui/preferences.ts";
import { getAiStatus } from "../src/lib/ai/status.ts";
import { loadWorkspaceSummary } from "../src/lib/ui/workspace-summary.ts";
import { isProtectedPath, getSafeNextPath } from "../src/lib/auth/redirect.ts";

test("Account and Settings remain protected and safe return destinations", () => {
  for (const path of ["/account", "/settings"]) {
    assert.equal(isProtectedPath(path), true);
    assert.equal(isProtectedPath(`${path}/child`), true);
    assert.equal(getSafeNextPath(path), path);
  }
  assert.equal(isProtectedPath("/account-other"), false);
  assert.equal(getSafeNextPath("//evil.example/settings"), "/");
});

test("Account/workspace counts deduplicate pages, stay bounded, and never invent counts on failure", async () => {
  const calls = [];
  const summary = await loadWorkspaceSummary(undefined, async (url, options) => {
    calls.push(url); assert.equal(options.cache, "no-store");
    if (url.startsWith("/api/documents")) return Response.json({ documents: [{ id: "owned-pdf" }], nextOffset: Number(new URL(url, "http://localhost").searchParams.get("offset")) + 20 });
    return Response.json({ conversations: [{ id: "owned-chat" }], nextOffset: null });
  });
  assert.equal(calls.filter(url => url.startsWith("/api/documents")).length, 5);
  assert.equal(summary.documents.records.length, 1);
  assert.equal(summary.documents.more, true);
  assert.equal(summary.conversations.records.length, 1);
  assert.equal(summary.conversations.more, false);
  await assert.rejects(loadWorkspaceSummary(undefined, async () => Response.json({ error: "Sign in again." }, { status: 401 })), /Sign in again/);
});

test("Appearance uses system for missing or invalid preferences, and respects explicit choices", () => {
  for (const value of [null, "", "sepia", "system"]) assert.equal(parseTheme(value), "system");
  assert.equal(resolveTheme(parseTheme("dark"), false), "dark");
  assert.equal(resolveTheme(parseTheme("light"), true), "light");
  assert.equal(resolveTheme("system", true), "dark");
  assert.equal(resolveTheme("system", false), "light");
});

test("Document links round-trip only a UUID scope; malformed scope cannot become a path", () => {
  const id = "618c8ae0-a5d5-41d8-808f-2d6db85e3de8";
  const url = new URL(documentChatHref(id), "http://localhost");
  assert.equal(url.pathname, "/chat");
  assert.equal(parseDocumentScope(url.searchParams.get("document")), id);
  for (const value of [null, "", "../other-user", "https://example.com", `${id}/extra`]) assert.equal(parseDocumentScope(value), "");
});

test("AI status never checks a runtime in mock, disabled, or unsupported modes", async () => {
  const previous = process.env.LLM_MODE;
  try {
    for (const mode of ["mock", "openai", "unsupported"]) {
      process.env.LLM_MODE = mode;
      const status = await getAiStatus(() => { throw new Error("Must not contact a runtime"); });
      assert.equal(status.mode, mode === "mock" ? "mock" : "disabled");
      assert.equal(status.available, mode === "mock");
    }
  } finally { if (previous === undefined) delete process.env.LLM_MODE; else process.env.LLM_MODE = previous; }
});

test("Local status reports reviewed inventory only and sanitizes runtime errors", async () => {
  const previous = process.env.LLM_MODE; process.env.LLM_MODE = "local";
  try {
    let calls = 0;
    const ready = await getAiStatus(async () => { calls++; return { runtimeAvailable: true, modelInstalled: true, modelMatches: true }; });
    assert.equal(calls, 1); assert.equal(ready.available, true); assert.equal(ready.model, "Qwen3 4B");
    const missing = await getAiStatus(async () => ({ runtimeAvailable: true, modelInstalled: false, modelMatches: false }));
    assert.equal(missing.available, false);
    const failed = await getAiStatus(async () => { throw new Error("private URL or key"); });
    assert.equal(failed.available, false); assert.match(failed.detail, /Start Ollama/);
    assert.doesNotMatch(JSON.stringify(failed), /private URL or key/);
  } finally { if (previous === undefined) delete process.env.LLM_MODE; else process.env.LLM_MODE = previous; }
});
