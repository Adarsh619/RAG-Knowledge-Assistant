import assert from "node:assert/strict";
import test from "node:test";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import tls from "node:tls";
import { syncBuiltinESMExports } from "node:module";

test("Phase 2 chat contract and zero outbound requests", async (t) => {
  const previousMode = process.env.LLM_MODE;
  const previousKey = process.env.OPENAI_API_KEY;
  let outboundAttempts = 0;
  function blockNetwork() {
    outboundAttempts += 1;
    throw new Error("Outbound network calls are forbidden in chat validation.");
  }

  // Fail before any network I/O if a provider later adds fetch or Node networking.
  const replacements = [
    [globalThis, "fetch"],
    [http, "request"],
    [http, "get"],
    [https, "request"],
    [https, "get"],
    [net, "connect"],
    [net, "createConnection"],
    [tls, "connect"],
  ].map(([owner, key]) => ({ owner, key, original: owner[key] }));
  for (const { owner, key } of replacements) owner[key] = blockNetwork;
  syncBuiltinESMExports();

  try {
    const { POST } = await import("../src/app/api/chat/route.ts");
    const { getLlmMode, getLlmProvider } =
      await import("../src/lib/ai/provider.ts");
    const { mockProvider } = await import("../src/lib/ai/providers/mock.ts");

    function request(body) {
      return new Request("http://localhost/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    }

    await t.test(
      "unset mode defaults to mock even with a dummy key",
      async () => {
        delete process.env.LLM_MODE;
        process.env.OPENAI_API_KEY = "not-a-real-key-used-only-in-local-tests";
        assert.equal(getLlmMode(), "mock");
        const response = await POST(request({ message: "  Hello backend  " }));
        assert.equal(response.status, 200);
        assert.equal(response.headers.get("Cache-Control"), "no-store");
        const data = await response.json();
        assert.equal(data.mode, "mock");
        assert.equal(data.message.role, "assistant");
        assert.match(data.message.content, /Local mock response/);
        assert.match(data.message.content, /“Hello backend”/);
        assert.doesNotMatch(data.message.content, /not-a-real-key/);
      },
    );

    await t.test(
      "explicit mock mode returns the request-specific local reply",
      async () => {
        process.env.LLM_MODE = "mock";
        const response = await POST(
          request({ message: "How does this pipeline work?" }),
        );
        assert.equal(response.status, 200);
        assert.match(
          (await response.json()).message.content,
          /How does this pipeline work\?/,
        );
      },
    );

    await t.test(
      "invalid inputs fail before reaching the provider",
      async () => {
        for (const body of [
          null,
          {},
          { message: 123 },
          { message: "" },
          { message: "   " },
          { message: "x".repeat(4001) },
        ]) {
          const response = await POST(request(body));
          assert.equal(response.status, 400);
          assert.equal(typeof (await response.json()).error, "string");
        }
        const response = await POST(
          new Request("http://localhost/api/chat", {
            method: "POST",
            body: "{invalid json",
          }),
        );
        assert.equal(response.status, 400);
      },
    );

    await t.test(
      "openai mode is blocked, including direct provider calls",
      async () => {
        process.env.LLM_MODE = "openai";
        const response = await POST(
          request({ message: "Do not contact OpenAI" }),
        );
        assert.equal(response.status, 503);
        assert.match((await response.json()).error, /OpenAI is disabled/);
        await assert.rejects(
          getLlmProvider().reply("Still do not contact OpenAI"),
          /OpenAI is disabled/,
        );
      },
    );

    await t.test(
      "unknown mode fails closed instead of choosing another provider",
      async () => {
        process.env.LLM_MODE = "unknown-provider";
        const response = await POST(
          request({ message: "Test configuration error" }),
        );
        assert.equal(response.status, 503);
        assert.throws(getLlmProvider, /Unsupported LLM_MODE/);
      },
    );

    await t.test("provider failures return a safe error", async () => {
      process.env.LLM_MODE = "mock";
      const originalReply = mockProvider.reply;
      mockProvider.reply = async () => {
        throw new Error("internal-error-do-not-expose");
      };
      try {
        const response = await POST(request({ message: "Test failure" }));
        assert.equal(response.status, 500);
        assert.doesNotMatch(
          (await response.json()).error,
          /internal-error-do-not-expose/,
        );
      } finally {
        mockProvider.reply = originalReply;
      }
    });

    await t.test(
      "no fetch, HTTP, HTTPS, TCP, or TLS requests were attempted",
      () => {
        assert.equal(outboundAttempts, 0);
      },
    );
  } finally {
    for (const { owner, key, original } of replacements) owner[key] = original;
    syncBuiltinESMExports();
    if (previousMode === undefined) delete process.env.LLM_MODE;
    else process.env.LLM_MODE = previousMode;
    if (previousKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousKey;
  }
});
