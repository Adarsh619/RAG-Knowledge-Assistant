import assert from "node:assert/strict";
import test from "node:test";
import { buildRagSources, SOURCE_EXCERPT_CHARACTERS } from "../src/lib/rag/sources.ts";
import { groupRagSources, formatSourcePages } from "../src/lib/rag/source-presentation.ts";
import { answerFromDocuments } from "../src/lib/rag/answer.ts";
import { handleChatRequest } from "../src/lib/ai/chat-handler.ts";

const documentId = "00000000-0000-4000-8000-000000000001";
const base = {
  documentId, chunkId: "chunk-a", chunkIndex: 0, content: "Cedar uses React. useState stores state.",
  characterCount: 38, pageNumbers: [1, 3], originalFilename: "handbook.pdf", processedAt: "now",
  startOffset: 0, endOffset: 38, similarity: 0.9,
};
const input = { question: "What does useState do?", documentId: null, topK: 5, minSimilarity: 0.3 };
const generateQuery = async () => ({ vector: [1, ...Array(383).fill(0)] });
const context = (matches) => ({ repository: { search: async () => matches } });
const provider = (inspect = () => {}) => ({ mode: "local", enabled: true, reply: async (text) => {
  inspect(JSON.parse(text)); return "useState stores state. Any filename invented here is not source metadata.";
} });

test("source identity/pages/rank/similarity come from context, not generated claims", () => {
  const source = buildRagSources([base])[0];
  assert.deepEqual(source, { rank: 1, documentId, chunkId: "chunk-a", originalFilename: "handbook.pdf",
    chunkIndex: 0, pageNumbers: [1, 3], similarity: 0.9, excerpt: base.content, excerptTruncated: false });
  source.pageNumbers.push(9);
  assert.deepEqual(base.pageNumbers, [1, 3]);
});

test("shortened excerpts are exact bounded prefixes, including Unicode and long words", () => {
  for (const content of ["Cedar React state. ".repeat(50), "x".repeat(800), "x".repeat(359) + "🧠" + "suffix", " \nText\n".repeat(90)]) {
    const source = buildRagSources([{ ...base, content }])[0];
    assert.ok(content.startsWith(source.excerpt));
    assert.ok(source.excerpt.length <= SOURCE_EXCERPT_CHARACTERS);
    assert.ok(!/[\uD800-\uDBFF]$/.test(source.excerpt));
    assert.equal(source.excerptTruncated, true);
  }
});

test("document grouping preserves every unique overlapping chunk and its own pages", () => {
  const sources = buildRagSources([base, { ...base, chunkId: "b", chunkIndex: 1, pageNumbers: [3, 4] },
    { ...base, chunkId: "c", documentId: "other-document", originalFilename: "handbook.pdf", pageNumbers: [8] }, base]);
  assert.equal(sources.length, 3);
  const groups = groupRagSources([...sources].reverse());
  assert.equal(groups.length, 2); // Same filename does not merge different document IDs.
  assert.deepEqual(groups[0].pageNumbers, [1, 3, 4]);
  assert.deepEqual(groups[0].sources.map(source => source.chunkId), ["chunk-a", "b"]);
  assert.deepEqual(groups[0].sources[0].pageNumbers, [1, 3]);
  assert.equal(groupRagSources([sources[0], sources[0]])[0].sources.length, 1);
});

test("page labels preserve gaps and only compress consecutive physical pages", () => {
  assert.equal(formatSourcePages([1, 3]), "Pages 1, 3");
  assert.equal(formatSourcePages([4, 3, 1, 3, 7, 8]), "Pages 1, 3–4, 7–8");
  assert.equal(formatSourcePages([4]), "Page 4");
  assert.equal(formatSourcePages([]), "Page unavailable");
});

test("only actual prompt passages become sources, including budget/threshold exclusions", async () => {
  let supplied;
  const result = await answerFromDocuments(input, context([
    { ...base, chunkId: "huge", content: "你".repeat(10000), similarity: 1 },
    { ...base, chunkId: "weak", similarity: 0.2 },
    { ...base, chunkId: "blank", content: " " },
    { ...base, chunkId: "second", similarity: 0.7, chunkIndex: 1 }, base, base,
  ]), { provider: provider(prompt => { supplied = prompt.referencePassages; }), generateQuery });
  assert.deepEqual(result.sources.map(source => source.chunkId), ["chunk-a", "second"]);
  assert.equal(result.sources.length, supplied.length);
  for (const [i, source] of result.sources.entries()) {
    assert.equal(source.originalFilename, supplied[i].filename);
    assert.deepEqual(source.pageNumbers, supplied[i].pages);
    assert.ok(supplied[i].text.startsWith(source.excerpt));
    assert.equal(source.similarity, supplied[i].similarity);
  }
  assert.ok(!JSON.stringify(result.sources).includes("embedding"));
});

test("insufficient context or a foreign scoped document returns no source metadata or generation", async () => {
  for (const matches of [[], [{ ...base, similarity: 0.29 }]]) {
    const result = await answerFromDocuments({ ...input, documentId }, context(matches), {
      generateQuery, provider: provider(() => assert.fail("No generation without usable owned context")),
    });
    assert.equal(result.rag.status, "insufficient_context");
    assert.deepEqual(result.sources, []);
    assert.ok(!JSON.stringify(result).includes("handbook.pdf"));
  }
});

test("model abstention cannot fabricate a source; application retains honest input provenance", async () => {
  const result = await answerFromDocuments(input, context([base]), { generateQuery,
    provider: { mode: "local", enabled: true, reply: async () => "The supplied context does not state a budget. Imaginary.pdf page 99 is untrusted model output." } });
  assert.equal(result.sources[0].originalFilename, "handbook.pdf");
  assert.deepEqual(result.sources[0].pageNumbers, [1, 3]);
  assert.ok(!JSON.stringify(result.sources).includes("Imaginary"));
});

test("API rejects client-forged sources and returns authenticated sources only; mock stays empty", async () => {
  const previous = process.env.LLM_MODE;
  const request = (extra = {}) => new Request("http://localhost:3000/api/chat", { method: "POST",
    headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: input.question, ...extra }) });
  try {
    process.env.LLM_MODE = "local";
    const run = (query, ctx) => answerFromDocuments(query, ctx, { provider: provider(), generateQuery });
    assert.equal((await handleChatRequest(request(), null, run)).status, 401);
    assert.equal((await handleChatRequest(request({ sources: [base] }), context([base]), run)).status, 400);
    const own = await (await handleChatRequest(request(), context([base]), run)).json();
    assert.equal(own.sources[0].documentId, documentId);
    const other = await (await handleChatRequest(request({ documentId }), context([]), run)).json();
    assert.deepEqual(other.sources, []);
    assert.ok(!JSON.stringify(other).includes("handbook.pdf"));
    process.env.LLM_MODE = "mock";
    const mock = await (await handleChatRequest(request(), { repository: { search: async () => assert.fail("No retrieval in mock mode") } }, run)).json();
    assert.deepEqual(mock.sources, []);
    assert.equal(mock.mode, "mock");
  } finally {
    if (previous === undefined) delete process.env.LLM_MODE;
    else process.env.LLM_MODE = previous;
  }
});
