import assert from "node:assert/strict";
import test from "node:test";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import tls from "node:tls";
import { createTextPdf } from "./pdf-fixtures.mjs";
import { CHUNKING_TEST_PAGES } from "./chunking-fixtures.mjs";

test("Real cached MiniLM CPU embeddings, semantic similarity and zero network", async (t) => {
  const saved = [];
  let outboundAttempts = 0;
  for (const [target, keys] of [
    [globalThis, ["fetch"]],
    [http, ["request", "get"]],
    [https, ["request", "get"]],
    [net, ["connect", "createConnection"]],
    [tls, ["connect"]],
  ]) {
    for (const key of keys) {
      saved.push([target, key, target[key]]);
      target[key] = () => {
        outboundAttempts++;
        throw new Error("Real model tests block all network before I/O.");
      };
    }
  }
  try {
    const { localChunkEmbedder, createChunkEmbedder } = await import(
      "../src/lib/embeddings/embed-chunks.ts"
    );
    const { loadLocalEmbeddingModel } = await import(
      "../src/lib/embeddings/local-model.ts"
    );
    const { extractPdfText } = await import("../src/lib/pdf/extract-text.ts");
    const { chunkDocument } = await import("../src/lib/rag/chunk-document.ts");
    const sentences = [
      "React is a JavaScript UI library",
      "React is used to build user interfaces",
      "Whales swim in the ocean and eat small fish",
    ];
    const inputs = sentences.map((text, chunkIndex) => ({
      chunkIndex,
      text,
      documentId: "public-learning-sentences",
      characterCount: text.length,
      pageNumbers: [1],
      startOffset: 0,
      endOffset: text.length,
      overlapWithPrevious: 0,
      forcedWordSplit: false,
    }));
    let learningResult;
    await t.test(
      "real local model produces finite, normalized 384-dimensional vectors",
      async () => {
        learningResult = await localChunkEmbedder.embedChunks(inputs);
        assert.equal(learningResult.model, "Xenova/all-MiniLM-L6-v2");
        assert.equal(learningResult.dimension, 384);
        assert.equal(learningResult.embeddedChunkCount, 3);
        for (const chunk of learningResult.chunks) {
          assert.equal(chunk.embedding.length, 384);
          assert.ok(chunk.embedding.every(Number.isFinite));
          assert.ok(Math.abs(Math.hypot(...chunk.embedding) - 1) < 0.0001);
        }
        assert.equal(localChunkEmbedder.getStatistics().initializationCount, 1);
      },
    );
    await t.test(
      "cosine similarity ranks the related React sentence above the unrelated sentence",
      () => {
        // Learning comparison only: this test never contacts the database.
        const cosine = (a, b) =>
          a.reduce((sum, value, index) => sum + value * b[index], 0) /
          (Math.hypot(...a) * Math.hypot(...b));
        const [first, related, unrelated] = learningResult.chunks.map(
          (chunk) => chunk.embedding,
        );
        const relatedScore = cosine(first, related);
        const unrelatedScore = cosine(first, unrelated);
        console.log(
          JSON.stringify({
            relatedCosine: Number(relatedScore.toFixed(6)),
            unrelatedCosine: Number(unrelatedScore.toFixed(6)),
          }),
        );
        assert.ok(relatedScore > unrelatedScore + 0.1);
      },
    );
    await t.test(
      "actual multipage PDF chunks all receive embeddings and retain their metadata",
      async () => {
        const extraction = await extractPdfText(
          createTextPdf(CHUNKING_TEST_PAGES),
        );
        const chunks = chunkDocument(
          "public-multipage-embedding-fixture.pdf",
          extraction.pages,
        ).chunks;
        const result = await localChunkEmbedder.embedChunks(chunks);
        assert.equal(result.embeddedChunkCount, chunks.length);
        assert.equal(result.modelReused, true);
        for (const [index, chunk] of result.chunks.entries()) {
          const { embedding, tokenCount, ...metadata } = chunk;
          assert.deepEqual(metadata, chunks[index]);
          assert.equal(embedding.length, 384);
          assert.ok(tokenCount <= 512);
          assert.ok(embedding.every(Number.isFinite));
          assert.ok(Math.abs(Math.hypot(...embedding) - 1) < 0.0001);
        }
        assert.equal(localChunkEmbedder.getStatistics().initializationCount, 1);
      },
    );
    await t.test(
      "identical text is repeatable and still reuses the same initialized model",
      async () => {
        const result = await localChunkEmbedder.embedChunks(inputs);
        assert.equal(result.modelReused, true);
        assert.equal(localChunkEmbedder.getStatistics().initializationCount, 1);
        // The same inputs/batch shape must repeat consistently. The quantized
        // model may vary slightly when another batch has different padding.
        result.chunks[0].embedding.forEach((value, index) =>
          assert.ok(
            Math.abs(value - learningResult.chunks[0].embedding[index]) <
              0.00001,
          ),
        );
      },
    );
    await t.test(
      "real tokenizer detects capacity overflow before the pipeline can truncate",
      async () => {
        const oversized = {
          ...inputs[0],
          text: "你".repeat(600),
          characterCount: 600,
          endOffset: 600,
        };
        await assert.rejects(
          localChunkEmbedder.embedChunks([oversized]),
          (error) =>
            error.status === 422 && /no text was truncated/.test(error.message),
        );
      },
    );
    await t.test(
      "image-only PDF produces zero chunks and embeddings without model initialization",
      async () => {
        const extraction = await extractPdfText(createTextPdf([null]));
        const service = createChunkEmbedder(loadLocalEmbeddingModel);
        const result = await service.embedChunks(
          chunkDocument("public-image-only-fixture.pdf", extraction.pages)
            .chunks,
        );
        assert.equal(result.embeddedChunkCount, 0);
        assert.equal(service.getStatistics().initializationCount, 0);
      },
    );
    await t.test("query vectors share the ingestion model, revision and singleton", async () => {
      const { embedQuery } = await import("../src/lib/embeddings/embed-query.ts");
      const query = await embedQuery("How does React help build user interfaces?");
      assert.equal(query.vector.length, 384);
      assert.ok(query.vector.every(Number.isFinite));
      assert.ok(Math.abs(Math.hypot(...query.vector) - 1) < 0.0001);
      assert.equal(query.metadata.model, learningResult.model);
      assert.equal(query.metadata.revision, learningResult.revision);
      assert.equal(query.metadata.modelReused, true);
      assert.equal(localChunkEmbedder.getStatistics().initializationCount, 1);
      const score = (vector) => query.vector.reduce((sum, value, i) => sum + value * vector[i], 0);
      assert.ok(score(learningResult.chunks[1].embedding) > score(learningResult.chunks[2].embedding) + 0.1);
      await assert.rejects(embedQuery("你".repeat(600)), (error) => error.status === 422 && /question exceeds/.test(error.message));
    });
    await t.test(
      "real model loading and inference attempted zero outbound requests",
      () => {
        assert.equal(outboundAttempts, 0);
      },
    );
  } finally {
    for (const [target, key, original] of saved) target[key] = original;
  }
});
