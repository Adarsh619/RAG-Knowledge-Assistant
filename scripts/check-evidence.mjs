import assert from "node:assert/strict";
import test from "node:test";
import { answerFromDocuments } from "../src/lib/rag/answer.ts";
import { buildEvidenceAnswer, EVIDENCE_INTRO } from "../src/lib/rag/evidence.ts";
import { buildRagSources } from "../src/lib/rag/sources.ts";
import { evidenceProvider } from "../src/lib/ai/providers/evidence.ts";
import { getLlmProvider } from "../src/lib/ai/provider.ts";
import { getActiveLocalModel, getLocalRuntime } from "../src/lib/ai/local-config.ts";
import { getAiStatus } from "../src/lib/ai/status.ts";
import { handleChatRequest } from "../src/lib/ai/chat-handler.ts";

const doc = "00000000-0000-4000-8000-000000000001";
const chunk = (index, content, similarity, pages = [index + 1]) => ({
  documentId: doc, chunkId: `00000000-0000-4000-8000-00000000010${index}`, chunkIndex: index, content,
  characterCount: content.length, pageNumbers: pages, startOffset: 0, endOffset: content.length,
  originalFilename: "react-notes.pdf", processedAt: "2026-11-11T00:00:00.000Z", similarity,
});
const matches = [
  chunk(0, "The React learning project is named Cedar-47.", 0.71, [1]),
  chunk(1, `Cedar-47 effects run after paint. ${"Cleanup runs before the next effect. ".repeat(12)}`, 0.55, [3, 4]),
  chunk(2, "Unrelated weather note.", 0.12),
];
const input = { question: "What is the project named?", topK: 5, minSimilarity: 0.3, documentId: null };
const fakeQuery = async () => ({ vector: Array(384).fill(0) });
const context = (results = matches) => ({ repository: { search: async () => results } });
const KEYS = ["LLM_MODE", "LOCAL_RUNTIME"];
async function withEnv(values, run) {
  const old = Object.fromEntries(KEYS.map(key => [key, process.env[key]]));
  try {
    for (const key of KEYS) if (values[key] === undefined) delete process.env[key]; else process.env[key] = values[key];
    return await run();
  } finally {
    for (const key of KEYS) if (old[key] === undefined) delete process.env[key]; else process.env[key] = old[key];
  }
}

test("Evidence text is built only from stored excerpts with sources and pages", () => {
  const sources = buildRagSources(matches.slice(0, 2));
  const text = buildEvidenceAnswer(sources);
  assert.ok(text.startsWith(EVIDENCE_INTRO));
  assert.match(text, /\[1\] react-notes\.pdf, Page 1:\n“The React learning project is named Cedar-47\.”/);
  assert.match(text, /\[2\] react-notes\.pdf, Pages 3–4:\n“Cedar-47 effects run after paint\./);
  assert.ok(sources[1].excerptTruncated && text.includes("…”"), "shortened excerpts are marked");
  for (const source of sources) assert.ok(text.includes(source.excerpt));
});

test("Evidence-only provider answers documents without generating", async () => {
  const result = await answerFromDocuments(input, context(), { provider: evidenceProvider, generateQuery: fakeQuery });
  assert.equal(result.rag.status, "evidence");
  assert.equal(result.rag.model, null);
  assert.equal(result.rag.contextChunkCount, 2, "low-similarity passages are excluded as usual");
  assert.equal(result.sources.length, 2);
  assert.equal(result.content, buildEvidenceAnswer(result.sources));
  assert.ok(Buffer.byteLength(JSON.stringify(result.rag)) <= 1000, "fits the saved rag column limit");
  assert.ok(result.content.length <= 20000, "fits the saved message limit");
});

test("Evidence-only keeps the insufficient-context answer when nothing matches", async () => {
  const result = await answerFromDocuments(input, context([chunk(0, "Unrelated.", 0.1)]),
    { provider: evidenceProvider, generateQuery: fakeQuery });
  assert.equal(result.rag.status, "insufficient_context");
  assert.deepEqual(result.sources, []);
});

test("Evidence runtime is selectable and reported without contacting any model", () => withEnv({ LLM_MODE: "local", LOCAL_RUNTIME: "evidence" }, async () => {
  assert.equal(getLocalRuntime(), "evidence");
  assert.equal(getLlmProvider(), evidenceProvider);
  assert.equal(getActiveLocalModel().label, "Evidence answers");
  const status = await getAiStatus(async () => assert.fail("No Ollama check"), async () => assert.fail("No model check"));
  assert.deepEqual([status.available, status.runtime, status.model], [true, "evidence", "Evidence answers"]);
  await assert.rejects(evidenceProvider.reply("hi", { system: "x" }), e => e.status === 503 && /evidence only/.test(e.message));
}));

test("Chat modes with evidence-only: Auto keeps insufficient results, General reports no generator", () => withEnv({ LLM_MODE: "local", LOCAL_RUNTIME: "evidence" }, async () => {
  const request = chatMode => new Request("http://localhost/api/chat", { method: "POST",
    headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: "Anything?", chatMode }) });
  const insufficient = { content: "Insufficient", sources: [], rag: { status: "insufficient_context", model: null,
    retrievedChunkCount: 0, contextChunkCount: 0, contextBytes: 0 } };
  let generalCalls = 0;
  const auto = await handleChatRequest(request("auto"), context(), async () => insufficient, async () => { generalCalls++; });
  assert.equal(auto.status, 200);
  assert.equal((await auto.json()).rag.status, "insufficient_context");
  assert.equal(generalCalls, 0, "no general fallback without a generator");
  const general = await handleChatRequest(request("general"), context());
  assert.equal(general.status, 503);
  assert.match((await general.json()).error, /evidence only/);
}));
