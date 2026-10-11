import assert from "node:assert/strict";
import test from "node:test";
import { createLocalProvider, checkLocalRuntime } from "../src/lib/ai/providers/local.ts";
import { LOCAL_MODEL } from "../src/lib/ai/local-config.ts";
import { getSupabaseConfig } from "../src/lib/supabase/config.ts";
import { readApiResponse } from "../src/lib/http/client-response.ts";
import nextConfig from "../next.config.ts";

const installed = { name: LOCAL_MODEL.name, digest: LOCAL_MODEL.digest,
  details: { format: "gguf", family: "qwen3", quantization_level: "Q4_K_M" } };
const prompt = { system: "Answer using reference material." };

test("Local malformed JSON, null and scalar responses report sanitized protocol errors", async () => {
  for (const value of ["not-json secret-content", "null", "[]", '"scalar"']) {
    const provider = createLocalProvider(async () => new Response(value));
    await assert.rejects(provider.reply("private question", prompt), e => e.status === 502 && !e.message.includes("secret-content"));
  }
});
test("Model inventory ignores null entries and requires the reviewed local model", async () => {
  const result = await checkLocalRuntime(async () => Response.json({ models: [null, "invalid", installed] }));
  assert.equal(result.modelMatches, true);
  await assert.rejects(checkLocalRuntime(async () => Response.json({ models: "invalid" })), e => e.status === 502);
});
test("Oversized local responses fail without exposing their content", async () => {
  const provider = createLocalProvider(async () => new Response("x".repeat(262145)));
  await assert.rejects(provider.reply("private question", prompt), e => e.status === 502);
});
test("Ollama connection refusal gives local start instructions without fallback", async () => {
  let calls = 0;
  const provider = createLocalProvider(async url => {
    calls++; assert.equal(new URL(url).origin, "http://127.0.0.1:11434");
    throw new Error("ECONNREFUSED private stack");
  });
  await assert.rejects(provider.reply("private question", prompt), e =>
    e.status === 503 && /ollama serve/.test(e.message) && !/private stack/.test(e.message));
  assert.equal(calls, 1);
});
test("Cancellation is distinct from an Ollama protocol failure", async () => {
  const controller = new AbortController(); controller.abort();
  const provider = createLocalProvider(async () => { throw new Error("secret reason"); });
  await assert.rejects(provider.reply("private question", { ...prompt, signal: controller.signal }), e =>
    e.status === 504 && /timed out/.test(e.message) && !e.message.includes("secret"));
});
test("Only completed stop responses become answers", async () => {
  for (const reason of [undefined, "length", "unexpected"]) {
    const provider = createLocalProvider(async url => url.endsWith("/tags")
      ? Response.json({ models: [installed] }) : Response.json({ done: true, done_reason: reason,
        message: { role: "assistant", content: "looks complete" } }));
    await assert.rejects(provider.reply("question", prompt), e => e.status === 502);
  }
});
test("Supabase URL validation rejects credentials, fragments and embedded paths", () => {
  const oldUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const oldKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  try {
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_offline_fixture";
    for (const url of ["https://user:secret@project.test", "https://project.test/path", "https://project.test?token=secret", "https://project.test/#secret", "http://project.test"]) {
      process.env.NEXT_PUBLIC_SUPABASE_URL = url;
      assert.throws(getSupabaseConfig, e => !/secret/.test(e.message));
    }
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://project.test";
    assert.equal(getSupabaseConfig().url, "https://project.test");
  } finally {
    if (oldUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL; else process.env.NEXT_PUBLIC_SUPABASE_URL = oldUrl;
    if (oldKey === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY; else process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = oldKey;
  }
});
test("Client API errors handle expired sessions, HTML and invalid contracts", async () => {
  await assert.rejects(readApiResponse(Response.json({ error: "raw detail" }, { status: 401 })), /Sign in again/);
  await assert.rejects(readApiResponse(new Response("<html>private proxy trace</html>")), e => /unreadable/.test(e.message) && !/private/.test(e.message));
  for (const data of [null, [], "bad"]) await assert.rejects(readApiResponse(Response.json(data)), /unexpected response/);
  assert.deepEqual(await readApiResponse(Response.json({ messages: [] })), { messages: [] });
});
test("Release responses disable framing, MIME sniffing and unnecessary device permissions", async () => {
  const headers = (await nextConfig.headers())[0].headers;
  assert.equal(nextConfig.poweredByHeader, false);
  assert.ok(headers.some(h => h.key === "X-Frame-Options" && h.value === "DENY"));
  assert.ok(headers.some(h => h.key === "X-Content-Type-Options" && h.value === "nosniff"));
  assert.ok(headers.some(h => h.key === "Permissions-Policy" && h.value.includes("microphone=()")));
});
