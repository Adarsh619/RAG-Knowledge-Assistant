import assert from "node:assert/strict";
import test from "node:test";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import tls from "node:tls";
import { createClient } from "@supabase/supabase-js";

test("Phase 9 retrieval contracts with all real network blocked", async (t) => {
  const saved = [];
  let networkAttempts = 0;
  for (const [target, keys] of [[globalThis, ["fetch"]], [http, ["request", "get"]], [https, ["request", "get"]], [net, ["connect", "createConnection"]], [tls, ["connect"]]])
    for (const key of keys) {
      saved.push([target, key, target[key]]);
      target[key] = () => { networkAttempts++; throw new Error("Network blocked before I/O"); };
    }
  try {
    const { parseSearchInput } = await import("../src/lib/retrieval/input.ts");
    const { handleSearchDocuments } = await import("../src/lib/retrieval/search-handler.ts");
    const { createRetrievalRepository } = await import("../src/lib/retrieval/repository.ts");
    const { createQueryEmbedder } = await import("../src/lib/embeddings/embed-query.ts");
    const { createChunkEmbedder, EmbeddingError } = await import("../src/lib/embeddings/embed-chunks.ts");
    const vector = [1, ...Array(383).fill(0)];
    const documentId = "00000000-0000-4000-8000-000000000001";
    const row = { document_id: documentId, chunk_id: "00000000-0000-4000-8000-000000000002", chunk_index: 2,
      content: "React hooks manage state.", character_count: 25, page_numbers: [1, 3], start_offset: 100, end_offset: 125,
      original_filename: "react.pdf", processed_at: "2026-10-09T00:00:00Z", similarity: 0.75 };
    let rpcError = false;
    let rows = [row];
    let lastRequest;
    const client = createClient("https://offline.test", "sb_publishable_offline_fixture", {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { fetch: async (input, init) => {
        const request = new Request(input, init);
        assert.equal(new URL(request.url).pathname, "/rest/v1/rpc/search_document_chunks");
        lastRequest = await request.json();
        return rpcError ? Response.json({ message: "private database detail" }, { status: 400 }) : Response.json(rows);
      } },
    });
    const repository = createRetrievalRepository(client);
    let modelLoads = 0;
    const service = createChunkEmbedder(async () => {
      modelLoads++;
      const pipeline = async (texts, options) => {
        assert.deepEqual(options, { pooling: "mean", normalize: true });
        return { dims: [texts.length, 384], data: texts.flatMap(() => vector) };
      };
      pipeline.countTokens = () => 8;
      return pipeline;
    });
    const generate = createQueryEmbedder(service.embedChunks);
    const context = { repository };
    const request = (value = { question: "What are React hooks?" }, headers = {}) => new Request("http://localhost:3000/api/documents/search", {
      method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(value),
    });
    await t.test("defaults and trimmed questions are explicit", () => {
      assert.deepEqual(parseSearchInput({ question: "  React hooks?  " }), { question: "React hooks?", topK: 5, minSimilarity: 0.3, documentId: null });
    });
    await t.test("empty, oversized and injected fields are rejected", () => {
      for (const value of [null, [], {}, { question: "  " }, { question: "x".repeat(1001) }, { question: "x", ownerId: documentId }, { question: "x", vector }])
        assert.throws(() => parseSearchInput(value), (e) => e.status === 400);
    });
    await t.test("top-k, threshold and UUID validation cover boundary cases", () => {
      for (const topK of [0, 21, 1.5, "5", null, NaN]) assert.throws(() => parseSearchInput({ question: "x", topK }));
      for (const minSimilarity of [-1.01, 1.01, NaN, Infinity, "0.3", null]) assert.throws(() => parseSearchInput({ question: "x", minSimilarity }));
      for (const id of ["../../other.pdf", "", 123]) assert.throws(() => parseSearchInput({ question: "x", documentId: id }));
      for (const minSimilarity of [-1, 0, 1]) assert.equal(parseSearchInput({ question: "x", topK: 20, minSimilarity, documentId }).minSimilarity, minSimilarity);
    });
    await t.test("signed-out and cross-origin requests never load a model", async () => {
      assert.equal((await handleSearchDocuments(request(), null, generate)).status, 401);
      assert.equal((await handleSearchDocuments(request({}, { origin: "https://other.test" }), context, generate)).status, 403);
      assert.equal(modelLoads, 0);
    });
    await t.test("wrong content type, malformed JSON and oversized bodies fail before inference", async () => {
      assert.equal((await handleSearchDocuments(request({}, { "Content-Type": "text/plain" }), context, generate)).status, 415);
      const invalid = new Request("http://localhost:3000/api/documents/search", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{" });
      assert.equal((await handleSearchDocuments(invalid, context, generate)).status, 400);
      assert.equal((await handleSearchDocuments(request({ question: "x".repeat(9000) }), context, generate)).status, 413);
      assert.equal(modelLoads, 0);
    });
    await t.test("query adapter shares normalization, revision and cached model", async () => {
      const first = await generate("React hooks");
      const next = await generate("React state");
      assert.equal(first.vector.length, 384);
      assert.equal(Math.hypot(...first.vector), 1);
      assert.equal(first.metadata.model, "Xenova/all-MiniLM-L6-v2");
      assert.equal(first.metadata.revision, "751bff37182d3f1213fa05d7196b954e230abad9");
      assert.equal(next.metadata.modelReused, true);
      assert.equal(modelLoads, 1);
    });
    await t.test("API returns metadata and passages, never a full vector or generated answer", async () => {
      const response = await handleSearchDocuments(request({ question: "React?", topK: 1, minSimilarity: 0.5, documentId }), context, generate);
      const body = await response.json();
      assert.equal(response.status, 200);
      assert.match(response.headers.get("cache-control"), /private, no-store/);
      assert.equal(body.matches[0].documentId, documentId);
      assert.deepEqual(body.matches[0].pageNumbers, [1, 3]);
      assert.equal(body.matches[0].chunkIndex, 2);
      assert.equal(body.matches[0].similarity, 0.75);
      assert.equal(body.matches[0].startOffset, 100);
      assert.equal(body.matches[0].originalFilename, "react.pdf");
      assert.equal(body.embedding.vector, undefined);
      assert.equal(body.answer, undefined);
      assert.deepEqual(lastRequest, { p_query_embedding: JSON.stringify(vector), p_top_k: 1, p_document_id: documentId, p_min_similarity: 0.5 });
    });
    await t.test("empty matches are successful, not a fabricated answer", async () => {
      rows = [];
      const response = await handleSearchDocuments(request(), context, generate);
      assert.equal(response.status, 200);
      assert.deepEqual((await response.json()).matches, []);
      rows = [row];
    });
    await t.test("database errors and unexpected failures do not expose internals", async () => {
      rpcError = true;
      const response = await handleSearchDocuments(request(), context, generate);
      assert.equal(response.status, 503);
      assert.doesNotMatch(await response.text(), /private database detail/);
      rpcError = false;
      const unknown = await handleSearchDocuments(request(), context, async () => { throw new Error("secret internal error"); });
      assert.equal(unknown.status, 503);
      assert.doesNotMatch(await unknown.text(), /secret internal/);
    });
    await t.test("busy/loading/token-limit errors retain actionable statuses", async () => {
      for (const status of [409, 503, 422]) {
        const response = await handleSearchDocuments(request(), context, async () => { throw new EmbeddingError("Local model error", status); });
        assert.equal(response.status, status);
      }
    });
    await t.test("query adapter refuses mismatched, non-finite and unnormalized output", async () => {
      const good = await service.embedChunks([{ documentId: "test", text: "x", chunkIndex: 0, characterCount: 1, pageNumbers: [], startOffset: 0, endOffset: 1, overlapWithPrevious: 0, forcedWordSplit: false }]);
      for (const bad of [
        { ...good, revision: "wrong" }, { ...good, dimension: 128 }, { ...good, chunks: [] },
        { ...good, chunks: [{ ...good.chunks[0], embedding: [NaN, ...vector.slice(1)] }] },
        { ...good, chunks: [{ ...good.chunks[0], embedding: Array(384).fill(0) }] },
      ]) await assert.rejects(createQueryEmbedder(async () => bad)("question"));
    });
    await t.test("repository rejects non-finite similarity", async () => {
      rows = [{ ...row, similarity: 2 }];
      await assert.rejects(repository.search(vector, parseSearchInput({ question: "x" })));
    });
    await t.test("no external request was attempted", () => assert.equal(networkAttempts, 0));
  } finally {
    for (const [target, key, original] of saved) target[key] = original;
  }
});
