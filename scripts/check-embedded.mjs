import assert from "node:assert/strict";
import test from "node:test";
import { createEmbeddedProvider, checkEmbeddedRuntime } from "../src/lib/ai/providers/embedded.ts";
import {
  getActiveLocalModel, getEmbeddedModel, getGenerationTimeoutMs, getLocalRuntime, EMBEDDED_MODELS,
} from "../src/lib/ai/local-config.ts";
import { getLlmProvider } from "../src/lib/ai/provider.ts";
import { localProvider } from "../src/lib/ai/providers/local.ts";
import { getAiStatus } from "../src/lib/ai/status.ts";

const prompt = { system: "Answer using reference material." };
const KEYS = ["LLM_MODE", "LOCAL_RUNTIME", "LOCAL_MODEL_ID", "GENERATION_TIMEOUT_MS"];

async function withEnv(values, run) {
  const old = Object.fromEntries(KEYS.map(key => [key, process.env[key]]));
  try {
    for (const key of KEYS) if (values[key] === undefined) delete process.env[key]; else process.env[key] = values[key];
    return await run();
  } finally {
    for (const key of KEYS) if (old[key] === undefined) delete process.env[key]; else process.env[key] = old[key];
  }
}
const generator = (result, seen = []) => async () => ({
  async generate(messages, options) { seen.push({ messages, options }); return typeof result === "function" ? result(options) : result; },
});

test("Runtime defaults to Ollama and only accepts reviewed runtimes and models", () => withEnv({}, () => {
  assert.equal(getLocalRuntime(), "ollama");
  assert.equal(getActiveLocalModel().name, "qwen3:4b-instruct");
  process.env.LOCAL_RUNTIME = "embedded";
  assert.equal(getEmbeddedModel().key, "qwen3-0.6b");
  assert.equal(getActiveLocalModel().name, EMBEDDED_MODELS["qwen3-0.6b"].id);
  process.env.LOCAL_MODEL_ID = "qwen3-1.7b";
  assert.equal(getActiveLocalModel().label, "Qwen3 1.7B");
  assert.match(getEmbeddedModel().directory, /3231b522c6e703b2f9b3cd8ea27426a1289a02f2$/);
  for (const id of ["qwen3:cloud", "toString", "__proto__", "../../etc"]) {
    process.env.LOCAL_MODEL_ID = id;
    assert.throws(getEmbeddedModel, e => e.status === 503 && /reviewed models/.test(e.message));
  }
  process.env.LOCAL_RUNTIME = "openai";
  assert.throws(getLocalRuntime, /ollama or embedded/);
}));

test("Provider selection follows LOCAL_RUNTIME within local mode", () => withEnv({ LLM_MODE: "local" }, () => {
  assert.equal(getLlmProvider(), localProvider);
  process.env.LOCAL_RUNTIME = "embedded";
  const provider = getLlmProvider();
  assert.notEqual(provider, localProvider);
  assert.equal(provider.mode, "local");
}));

test("Generation timeout is configurable only within bounds", () => withEnv({}, () => {
  assert.equal(getGenerationTimeoutMs(), 120000);
  for (const [value, expected] of [["180000", 180000], ["30000", 30000], ["300000", 300000],
    ["29999", 120000], ["300001", 120000], ["abc", 120000], [" ", 120000],["150000.5", 120000]]) {
    process.env.GENERATION_TIMEOUT_MS = value;
    assert.equal(getGenerationTimeoutMs(), expected, value);
  }
}));

test("Embedded provider sends system and user messages with bounded output", () => withEnv({}, async () => {
  const seen = [];
  const provider = createEmbeddedProvider(generator({ text: "  Grounded answer.  ", finished: true }, seen));
  assert.equal(await provider.reply("question", prompt), "Grounded answer.");
  assert.deepEqual(seen[0].messages, [{ role: "system", content: prompt.system }, { role: "user", content: "question" }]);
  assert.equal(seen[0].options.maxNewTokens, 384);
  assert.ok(seen[0].options.signal instanceof AbortSignal);
}));

test("Embedded provider rejects incomplete, empty, oversized or reasoning output", () => withEnv({}, async () => {
  for (const result of [{ text: "cut off", finished: false }, { text: "   ", finished: true },
    { text: "x".repeat(12001), finished: true }, { text: "<think>hidden</think>answer", finished: true }]) {
    const provider = createEmbeddedProvider(generator(result));
    await assert.rejects(provider.reply("question", prompt), e => e.status === 502);
  }
}));

test("Embedded provider validates prompts before loading the model", () => withEnv({}, async () => {
  let loads = 0;
  const provider = createEmbeddedProvider(async () => { loads++; assert.fail("Must not load"); });
  await assert.rejects(provider.reply("question", { system: " " }), e => e.status === 503);
  await assert.rejects(provider.reply("x".repeat(7001), prompt), e => e.status === 422);
  process.env.LOCAL_MODEL_ID = "unreviewed";
  await assert.rejects(provider.reply("question", prompt), e => /reviewed models/.test(e.message));
  assert.equal(loads, 0);
}));

test("Embedded provider is one-at-a-time, reports cancellation and sanitizes failures", () => withEnv({}, async () => {
  let release;
  const slow = createEmbeddedProvider(generator(() => new Promise(r => { release = () => r({ text: "done", finished: true }); })));
  const first = slow.reply("question", prompt);
  await new Promise(r => setTimeout(r, 0));
  await assert.rejects(slow.reply("question", prompt), e => e.status === 409);
  release();
  assert.equal(await first, "done");

  const controller = new AbortController(); controller.abort();
  const cancelled = createEmbeddedProvider(generator(({ signal }) => ({ text: "partial", finished: !signal.aborted })));
  await assert.rejects(cancelled.reply("question", { ...prompt, signal: controller.signal }), e => e.status === 504);

  const broken = createEmbeddedProvider(generator(() => { throw new Error("secret native trace"); }));
  await assert.rejects(broken.reply("question", prompt), e => e.status === 502 && !/secret/.test(e.message));
}));

test("Missing model files give preparation instructions and allow a later retry", () => withEnv({}, async () => {
  let attempts = 0;
  const provider = createEmbeddedProvider(async () => {
    if (++attempts === 1) throw new Error("ENOENT private path");
    return { generate: async () => ({ text: "ok", finished: true }) };
  });
  await assert.rejects(provider.reply("question", prompt), e => /models:prepare/.test(e.message) && !/private path/.test(e.message));
  assert.equal(await provider.reply("question", prompt), "ok");
}));

test("Status reports the selected runtime's model without loading weights", () => withEnv({ LLM_MODE: "local" }, async () => {
  const ollama = await getAiStatus(async () => ({ modelMatches: true }), async () => assert.fail("Wrong runtime"));
  assert.deepEqual([ollama.available, ollama.model], [true, "Qwen3 4B"]);
  process.env.LOCAL_RUNTIME = "embedded";
  const missing = await getAiStatus(async () => assert.fail("Wrong runtime"), () => checkEmbeddedRuntime(async () => false));
  assert.deepEqual([missing.available, missing.model], [false, "Qwen3 0.6B"]);
  assert.match(missing.detail, /models:prepare/);
  process.env.LOCAL_MODEL_ID = "unreviewed";
  const invalid = await getAiStatus();
  assert.equal(invalid.available, false);
}));
