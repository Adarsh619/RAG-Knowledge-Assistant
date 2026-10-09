import assert from "node:assert/strict";
import test from "node:test";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import tls from "node:tls";
import { createClient } from "@supabase/supabase-js";
import { createTextPdf, corruptPdf } from "./pdf-fixtures.mjs";

test("Phase 7 local embedding contracts and authenticated document flow, with no network", async (t) => {
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
        throw new Error("Network blocked before I/O.");
      };
    }
  }
  try {
    const { createChunkEmbedder, EmbeddingError } = await import(
      "../src/lib/embeddings/embed-chunks.ts"
    );
    const { handleEmbedDocument } = await import(
      "../src/lib/embeddings/document-handler.ts"
    );
    const { EMBEDDING_MODEL } = await import("../src/lib/embeddings/config.ts");
    const chunk = (index, text = `Local test passage ${index}.`) => ({
      chunkIndex: index,
      documentId: "fixture.pdf",
      text,
      characterCount: text.length,
      pageNumbers: [1, 3],
      startOffset: 0,
      endOffset: text.length,
      overlapWithPrevious: 0,
      forcedWordSplit: false,
    });
    function fakePipeline({
      count = (text) => text.split(/\s+/).length + 2,
      output,
    } = {}) {
      const calls = [];
      const model = async (texts, options) => {
        calls.push({ texts, options });
        if (output) return output(texts);
        const data = new Float32Array(texts.length * 384);
        texts.forEach((_, index) => {
          data[index * 384] = 1;
        });
        return { dims: [texts.length, 384], data };
      };
      model.countTokens = count;
      return { model, calls };
    }

    await t.test(
      "configuration pins the verified model, revision, CPU, dtype and dimension",
      () => {
        assert.equal(EMBEDDING_MODEL.id, "Xenova/all-MiniLM-L6-v2");
        assert.match(EMBEDDING_MODEL.revision, /^[a-f0-9]{40}$/);
        assert.equal(EMBEDDING_MODEL.dimension, 384);
        assert.equal(EMBEDDING_MODEL.batchSize, 4);
        assert.equal(EMBEDDING_MODEL.maxInputTokens, 512);
        assert.equal(EMBEDDING_MODEL.device, "cpu");
        assert.equal(EMBEDDING_MODEL.dtype, "q8");
      },
    );
    await t.test(
      "empty chunks return zero vectors without initializing the model",
      async () => {
        let loads = 0;
        const service = createChunkEmbedder(async () => {
          loads++;
          return fakePipeline().model;
        });
        const result = await service.embedChunks([]);
        assert.equal(result.embeddedChunkCount, 0);
        assert.equal(result.batchCount, 0);
        assert.deepEqual(result.chunks, []);
        assert.equal(loads, 0);
      },
    );
    await t.test(
      "small batches cover every chunk and preserve exact metadata/text",
      async () => {
        const fixture = fakePipeline();
        const service = createChunkEmbedder(async () => fixture.model);
        const inputs = Array.from({ length: 9 }, (_, index) => chunk(index));
        const original = structuredClone(inputs);
        const result = await service.embedChunks(inputs);
        assert.deepEqual(
          fixture.calls.map((call) => call.texts.length),
          [4, 4, 1],
        );
        assert.equal(result.embeddedChunkCount, inputs.length);
        assert.equal(result.batchCount, 3);
        assert.equal(result.normalized, true);
        result.chunks.forEach((item, index) => {
          const { embedding, tokenCount, ...metadata } = item;
          assert.deepEqual(metadata, inputs[index]);
          assert.equal(embedding.length, 384);
          assert.ok(embedding.every(Number.isFinite));
          assert.equal(Math.hypot(...embedding), 1);
          assert.ok(tokenCount > 0);
        });
        assert.deepEqual(inputs, original);
        assert.ok(
          fixture.calls.every(
            (call) =>
              call.options.pooling === "mean" &&
              call.options.normalize === true,
          ),
        );
      },
    );
    await t.test(
      "repeated documents reuse one lazy model instance",
      async () => {
        let loads = 0;
        const service = createChunkEmbedder(async () => {
          loads++;
          return fakePipeline().model;
        });
        assert.equal(service.getStatistics().initializationCount, 0);
        assert.equal(
          (await service.embedChunks([chunk(0)])).modelReused,
          false,
        );
        assert.equal((await service.embedChunks([chunk(1)])).modelReused, true);
        assert.equal(loads, 1);
        assert.equal(service.getStatistics().initializationCount, 1);
      },
    );
    await t.test(
      "simultaneous inference is bounded and busy requests can retry",
      async () => {
        let finishLoading;
        const fixture = fakePipeline();
        const service = createChunkEmbedder(
          () =>
            new Promise((resolve) => {
              finishLoading = resolve;
            }),
        );
        const first = service.embedChunks([chunk(0)]);
        await assert.rejects(
          service.embedChunks([chunk(1)]),
          (error) => error.status === 409,
        );
        finishLoading(fixture.model);
        await first;
        assert.equal(
          (await service.embedChunks([chunk(2)])).embeddedChunkCount,
          1,
        );
        assert.equal(service.getStatistics().active, false);
      },
    );
    await t.test(
      "failed initialization exposes no private details and permits a corrected retry",
      async () => {
        let attempts = 0;
        const service = createChunkEmbedder(async () => {
          if (++attempts === 1)
            throw new Error("fixture-private-loader-details");
          return fakePipeline().model;
        });
        await assert.rejects(
          service.embedChunks([chunk(0)]),
          (error) =>
            error instanceof EmbeddingError &&
            !error.message.includes("fixture-private"),
        );
        assert.equal(
          (await service.embedChunks([chunk(0)])).embeddedChunkCount,
          1,
        );
        assert.equal(attempts, 2);
      },
    );
    await t.test(
      "all tokens are checked before inference and oversized text is never truncated",
      async () => {
        const fixture = fakePipeline({
          count: (text) => (text === "oversized" ? 513 : 12),
        });
        const service = createChunkEmbedder(async () => fixture.model);
        await assert.rejects(
          service.embedChunks([chunk(0), chunk(1, "oversized")]),
          (error) =>
            error.status === 422 && /no text was truncated/.test(error.message),
        );
        assert.equal(fixture.calls.length, 0);
        assert.equal(
          (await service.embedChunks([chunk(0)])).embeddedChunkCount,
          1,
        );
      },
    );
    await t.test(
      "whitespace and invalid tokenizer counts are rejected safely",
      async () => {
        const service = createChunkEmbedder(async () => fakePipeline().model);
        await assert.rejects(
          service.embedChunks([chunk(0, "  ")]),
          (error) => error.status === 422,
        );
        assert.equal(service.getStatistics().initializationCount, 0);
        for (const count of [0, NaN, Infinity, 1.5]) {
          const invalid = createChunkEmbedder(
            async () => fakePipeline({ count: () => count }).model,
          );
          await assert.rejects(
            invalid.embedChunks([chunk(0)]),
            /invalid result/,
          );
        }
      },
    );
    await t.test(
      "wrong dimensions and missing vector rows fail before returning a partial result",
      async () => {
        for (const output of [
          () => ({ dims: [1, 383], data: new Float32Array(383) }),
          () => ({ dims: [2, 384], data: new Float32Array(768) }),
          () => ({ dims: [1, 384], data: new Float32Array(383) }),
        ]) {
          const service = createChunkEmbedder(
            async () => fakePipeline({ output }).model,
          );
          await assert.rejects(service.embedChunks([chunk(0)]), /dimension/);
        }
      },
    );
    await t.test(
      "NaN, infinity, zero and nonunit vectors are rejected",
      async () => {
        for (const value of [NaN, Infinity, 0, 2]) {
          const service = createChunkEmbedder(
            async () =>
              fakePipeline({
                output: () => {
                  const data = new Float32Array(384);
                  data[0] = value;
                  return { dims: [1, 384], data };
                },
              }).model,
          );
          await assert.rejects(
            service.embedChunks([chunk(0)]),
            /invalid or unnormalized/,
          );
        }
      },
    );

    const owner = "00000000-0000-4000-8000-000000000001";
    const other = "00000000-0000-4000-8000-000000000002";
    const id =
      "00000000-0000-4000-8000-000000000003--phase-7-embedding-test.pdf";
    let bytes = createTextPdf([
      "An owner-only document about local semantic embeddings.",
      "Source page two.",
    ]);
    const downloads = [];
    let embedCalls = 0;
    const service = createChunkEmbedder(async () => fakePipeline().model);
    const embed = async (chunks) => {
      embedCalls++;
      return service.embedChunks(chunks);
    };
    function context(userId = owner) {
      const client = createClient(
        "https://storage.test",
        "sb_publishable_offline_embedding_fixture",
        {
          auth: {
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false,
          },
          global: {
            fetch: async (input, init) => {
              const request = new Request(input, init);
              const url = new URL(request.url);
              assert.equal(url.origin, "https://storage.test");
              assert.equal(request.method, "GET");
              downloads.push(url.pathname);
              if (
                url.pathname !== `/storage/v1/object/documents/${owner}/${id}`
              )
                return Response.json(
                  { statusCode: "404", message: "Not found" },
                  { status: 404 },
                );
              return new Response(bytes, {
                headers: { "Content-Type": "application/pdf" },
              });
            },
          },
        },
      );
      return { userId, storage: client.storage };
    }
    function request(body = { id }, origin = "http://localhost:3000") {
      return new Request("http://localhost:3000/api/documents/embed", {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: origin },
        body: JSON.stringify(body),
      });
    }
    await t.test(
      "authenticated owner receives an embedding for each actual extracted chunk",
      async () => {
        const response = await handleEmbedDocument(request(), context(), embed);
        assert.equal(response.status, 200);
        assert.equal(
          response.headers.get("Cache-Control"),
          "private, no-store",
        );
        const result = await response.json();
        assert.equal(result.document.id, id);
        assert.equal(result.document.name, "phase-7-embedding-test.pdf");
        assert.equal(result.embeddings.embeddedChunkCount, 1);
        const item = result.embeddings.chunks[0];
        assert.equal(item.documentId, id);
        assert.equal(item.chunkIndex, 0);
        assert.deepEqual(item.pageNumbers, [1, 2]);
        assert.match(item.text, /owner-only/);
        assert.equal(item.embedding.length, 384);
      },
    );
    await t.test(
      "signed-out requests reach neither Storage nor the model",
      async () => {
        const before = [downloads.length, embedCalls];
        assert.equal(
          (await handleEmbedDocument(request(), null, embed)).status,
          401,
        );
        assert.deepEqual([downloads.length, embedCalls], before);
      },
    );
    await t.test(
      "another user's context cannot embed the owner's PDF",
      async () => {
        const before = embedCalls;
        const response = await handleEmbedDocument(
          request(),
          context(other),
          embed,
        );
        assert.equal(response.status, 404);
        assert.ok(downloads.at(-1).includes(`/${other}/${id}`));
        assert.equal(embedCalls, before);
        assert.doesNotMatch(await response.text(), /owner-only|embedding"/);
      },
    );
    await t.test(
      "forged owner/path/text fields and cross-origin requests cannot reach the model",
      async () => {
        const before = [downloads.length, embedCalls];
        for (const body of [
          { id: `${owner}/${id}` },
          { id, text: "forged text" },
          { id, userId: owner },
          { id, chunks: [] },
          { id: "bad.pdf" },
        ]) {
          assert.equal(
            (await handleEmbedDocument(request(body), context(), embed)).status,
            400,
          );
        }
        assert.equal(
          (
            await handleEmbedDocument(
              request({ id }, "https://other.test"),
              context(),
              embed,
            )
          ).status,
          403,
        );
        assert.deepEqual([downloads.length, embedCalls], before);
      },
    );
    await t.test(
      "empty/image-only owner PDF returns zero vectors without loading a model",
      async () => {
        bytes = createTextPdf([null]);
        let loads = 0;
        const emptyService = createChunkEmbedder(async () => {
          loads++;
          return fakePipeline().model;
        });
        const response = await handleEmbedDocument(
          request(),
          context(),
          emptyService.embedChunks,
        );
        assert.equal(response.status, 200);
        assert.equal((await response.json()).embeddings.embeddedChunkCount, 0);
        assert.equal(loads, 0);
      },
    );
    await t.test(
      "corrupted PDF fails before inference and model failures remain safe",
      async () => {
        bytes = corruptPdf;
        const before = embedCalls;
        assert.equal(
          (await handleEmbedDocument(request(), context(), embed)).status,
          422,
        );
        assert.equal(embedCalls, before);
        bytes = createTextPdf();
        const response = await handleEmbedDocument(
          request(),
          context(),
          async () => {
            throw new Error("fixture-private-model-details");
          },
        );
        assert.equal(response.status, 503);
        assert.doesNotMatch(await response.text(), /fixture-private/);
      },
    );
    await t.test(
      "all model/LLM/inference network attempts remained zero",
      () => {
        assert.equal(outboundAttempts, 0);
      },
    );
  } finally {
    for (const [target, key, original] of saved) target[key] = original;
  }
});
