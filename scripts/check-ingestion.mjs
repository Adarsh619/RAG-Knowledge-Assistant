import assert from "node:assert/strict";
import test from "node:test";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import tls from "node:tls";
import { createClient } from "@supabase/supabase-js";
import { createTextPdf, corruptPdf } from "./pdf-fixtures.mjs";

test("Phase 8 authenticated persistence contracts, with network blocked", async (t) => {
  const saved = [];
  let networkAttempts = 0;
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
        networkAttempts++;
        throw new Error("Network blocked before I/O");
      };
    }
  }
  try {
    const {
      handleIngestDocument,
      handlePersistentList,
      handlePersistentDeletion,
    } = await import("../src/lib/knowledge/document-handler.ts");
    const { createKnowledgeRepository, PersistenceError } = await import(
      "../src/lib/knowledge/repository.ts"
    );
    const { createChunkEmbedder, EmbeddingError } = await import(
      "../src/lib/embeddings/embed-chunks.ts"
    );
    const { EMBEDDING_MODEL } = await import("../src/lib/embeddings/config.ts");
    const owner = "00000000-0000-4000-8000-000000000001";
    const other = "00000000-0000-4000-8000-000000000002";
    const id =
      "00000000-0000-4000-8000-000000000003--phase-8-ingestion-test.pdf";
    const row = {
      id: "00000000-0000-4000-8000-000000000004",
      storage_name: id,
      storage_path: `${owner}/${id}`,
      original_filename: "phase-8-ingestion-test.pdf",
      file_size: 1234,
      ingestion_status: "ready",
      page_count: 3,
      extracted_characters: 2000,
      source_characters: 2002,
      chunk_count: 2,
      embedding_model: EMBEDDING_MODEL.id,
      embedding_revision: EMBEDDING_MODEL.revision,
      embedding_dimension: 384,
      processed_at: "2026-10-09T00:00:00Z",
      created_at: "2026-10-09T00:00:00Z",
    };
    const requests = [];
    let bytes = createTextPdf([
      Array(40).fill("React components build interfaces.").join("\n"),
      "",
      Array(40).fill("Local vectors retain source pages.").join("\n"),
    ]);
    let current = null;
    let exists = true;
    let removeError = false;
    let cleanupError = false;
    let persistError = false;
    let gets = 0;
    let persists = 0;
    let finishes = 0;
    let sourceSaved;
    let resultSaved;
    let rpcError = null;
    function client(user = owner) {
      return createClient(
        "https://offline.test",
        "sb_publishable_offline_fixture",
        {
          auth: {
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false,
          },
          global: {
            fetch: async (input, init) => {
              const req = new Request(input, init);
              const url = new URL(req.url);
              assert.equal(url.origin, "https://offline.test");
              requests.push(req);
              if (url.pathname.startsWith("/rest/v1/rpc/")) {
                if (rpcError) return Response.json(rpcError, { status: 400 });
                if (url.pathname.endsWith("persist_document_ingestion"))
                  return Response.json(row);
                if (url.pathname.endsWith("begin_document_deletion"))
                  return Response.json(row.id);
                if (url.pathname.endsWith("finish_document_deletion"))
                  return Response.json(true);
                assert.fail("Unexpected RPC");
              }
              if (url.pathname === "/rest/v1/documents") {
                const single = req.headers
                  .get("accept")
                  ?.includes("vnd.pgrst.object");
                return Response.json(single ? row : [row]);
              }
              if (url.pathname === "/storage/v1/object/list/documents")
                return Response.json(
                  exists
                    ? [
                        {
                          id: row.id,
                          name: id,
                          metadata: { size: bytes.length },
                          created_at: row.created_at,
                        },
                      ]
                    : [],
                );
              if (
                url.pathname === "/storage/v1/object/documents" &&
                req.method === "DELETE"
              ) {
                assert.deepEqual((await req.clone().json()).prefixes, [
                  `${user}/${id}`,
                ]);
                if (removeError)
                  return Response.json(
                    { statusCode: "503", message: "private-provider-error" },
                    { status: 503 },
                  );
                exists = false;
                return Response.json([]);
              }
              if (url.pathname.includes("/info/"))
                return exists
                  ? Response.json({ name: id })
                  : Response.json(
                      { statusCode: "404", message: "Not found" },
                      { status: 404 },
                    );
              if (
                url.pathname ===
                  `/storage/v1/object/documents/${owner}/${id}` &&
                user === owner &&
                exists
              )
                return new Response(bytes, {
                  headers: { "Content-Type": "application/pdf" },
                });
              return Response.json(
                { statusCode: "404", message: "Not found" },
                { status: 404 },
              );
            },
          },
        },
      );
    }
    const repository = {
      async get() {
        gets++;
        return current;
      },
      async list() {
        return current ? [current] : [];
      },
      async pending() {
        return current?.status === "deleting" ? [current] : [];
      },
      async persist(source, result, reingest) {
        persists++;
        sourceSaved = source;
        resultSaved = result;
        if (persistError) throw new Error("private-database-error");
        if (current && !reingest) throw new PersistenceError("Conflict", 409);
        current = {
          id: row.id,
          storageName: id,
          storagePath: `${owner}/${id}`,
          originalFilename: row.original_filename,
          fileSize: source.document.size,
          status: "ready",
          pageCount: source.extraction.pageCount,
          extractedCharacters: source.extraction.characterCount,
          sourceCharacters: source.chunking.sourceCharacterCount,
          chunkCount: result.chunks.length,
          embeddingModel: result.model,
          embeddingRevision: result.revision,
          embeddingDimension: result.dimension,
          processedAt: row.processed_at,
          createdAt: row.created_at,
        };
        return current;
      },
      async beginDeletion() {
        if (!exists && !current) return null;
        current = {
          ...(current ?? {
            storageName: id,
            originalFilename: row.original_filename,
            fileSize: bytes.length,
            createdAt: row.created_at,
          }),
          id: row.id,
          status: "deleting",
        };
        return row.id;
      },
      async finishDeletion() {
        finishes++;
        if (cleanupError || exists) throw new Error("private-cleanup-error");
        current = null;
      },
    };
    const context = (user = owner) => ({
      userId: user,
      storage: client(user).storage,
      repository,
    });
    const request = (body = { id }, origin = "http://localhost:3000") =>
      new Request("http://localhost:3000/api/documents/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: origin },
        body: JSON.stringify(body),
      });
    const model = async (texts) => {
      const data = new Float32Array(texts.length * 384);
      texts.forEach((_, i) => {
        data[i * 384] = 1;
      });
      return { dims: [texts.length, 384], data };
    };
    model.countTokens = () => 32;
    const embed = createChunkEmbedder(async () => model).embedChunks;

    await t.test(
      "owner pipeline persists every extracted chunk with text, pages, offsets and 384 vectors",
      async () => {
        const res = await handleIngestDocument(request(), context(), embed);
        assert.equal(res.status, 200);
        assert.equal(res.headers.get("cache-control"), "private, no-store");
        const body = await res.json();
        assert.equal(body.document.status, "ready");
        assert.equal(body.document.fileSize, bytes.length);
        assert.equal(body.document.pageCount, 3);
        assert.ok(body.document.chunkCount > 1);
        assert.equal(
          resultSaved.chunks.length,
          sourceSaved.chunking.chunks.length,
        );
        for (const chunk of resultSaved.chunks) {
          const { embedding, tokenCount, ...metadata } = chunk;
          assert.deepEqual(
            metadata,
            sourceSaved.chunking.chunks[chunk.chunkIndex],
          );
          assert.equal(embedding.length, 384);
          assert.equal(Math.hypot(...embedding), 1);
          assert.equal(tokenCount, 32);
          assert.ok(!chunk.pageNumbers.includes(2));
        }
        assert.ok(
          resultSaved.chunks.some((c) => c.pageNumbers.join(",") === "1,3"),
        );
        assert.ok(!("embeddings" in body));
      },
    );
    await t.test(
      "ordinary repeated ingestion stops before download/model/database replacement",
      async () => {
        const before = [requests.length, persists];
        assert.equal(
          (await handleIngestDocument(request(), context(), embed)).status,
          409,
        );
        assert.deepEqual([requests.length, persists], before);
      },
    );
    await t.test(
      "explicit re-ingestion retains document identity and replaces the same number of chunks",
      async () => {
        const old = current;
        assert.equal(
          (
            await handleIngestDocument(
              request({ id, reingest: true }),
              context(),
              embed,
            )
          ).status,
          200,
        );
        assert.equal(current.id, old.id);
        assert.equal(current.chunkCount, old.chunkCount);
      },
    );
    await t.test(
      "failed replacement preserves prior ready state and does not leak details",
      async () => {
        const before = structuredClone(current);
        persistError = true;
        const res = await handleIngestDocument(
          request({ id, reingest: true }),
          context(),
          embed,
        );
        assert.equal(res.status, 503);
        assert.doesNotMatch(await res.text(), /private-database/);
        assert.deepEqual(current, before);
        persistError = false;
      },
    );
    await t.test(
      "list includes persisted metadata without returning vectors or passage content",
      async () => {
        const res = await handlePersistentList(
          new Request("http://localhost:3000/api/documents"),
          context(),
        );
        const body = await res.json();
        assert.equal(body.documents[0].ingestion.id, current.id);
        assert.equal(body.documents[0].ingestion.embeddingDimension, 384);
        assert.doesNotMatch(
          JSON.stringify(body),
          /React components|"embedding":/,
        );
      },
    );
    await t.test(
      "unauthenticated ingestion, list and deletion cannot touch any dependency",
      async () => {
        const before = [requests.length, gets, persists];
        for (const handler of [
          handleIngestDocument,
          handlePersistentList,
          handlePersistentDeletion,
        ])
          assert.equal((await handler(request(), null)).status, 401);
        assert.deepEqual([requests.length, gets, persists], before);
      },
    );
    await t.test(
      "forged owner/path/chunk/vector fields and bad re-ingest type are rejected",
      async () => {
        const before = [requests.length, gets];
        for (const body of [
          { id: `${owner}/${id}` },
          { id, owner_id: owner },
          { id, chunks: [] },
          { id, embedding: [] },
          { id, reingest: "true" },
          null,
          {},
          { id: "bad.pdf" },
        ])
          assert.equal(
            (await handleIngestDocument(request(body), context(), embed))
              .status,
            400,
          );
        assert.equal(
          (
            await handleIngestDocument(
              request({ id }, "https://other.test"),
              context(),
              embed,
            )
          ).status,
          403,
        );
        assert.deepEqual([requests.length, gets], before);
      },
    );
    await t.test(
      "another user's storage path cannot ingest an owner's file",
      async () => {
        const before = persists;
        const previous = current;
        current = null;
        assert.equal(
          (await handleIngestDocument(request(), context(other), embed)).status,
          404,
        );
        assert.equal(persists, before);
        current = previous;
      },
    );
    await t.test(
      "empty and corrupted PDFs do not write database records",
      async () => {
        const previous = current;
        current = null;
        const before = persists;
        const original = bytes;
        for (const fixture of [createTextPdf([null]), corruptPdf]) {
          bytes = fixture;
          assert.equal(
            (await handleIngestDocument(request(), context(), embed)).status,
            422,
          );
        }
        assert.equal(persists, before);
        current = previous;
        bytes = original;
      },
    );
    await t.test(
      "model errors and mismatched model metadata fail before persistence",
      async () => {
        const before = persists;
        const busy = await handleIngestDocument(
          request({ id, reingest: true }),
          context(),
          async () => {
            throw new EmbeddingError("Busy", 409);
          },
        );
        assert.equal(busy.status, 409);
        const wrong = await handleIngestDocument(
          request({ id, reingest: true }),
          context(),
          async (chunks) => ({ ...(await embed(chunks)), dimension: 383 }),
        );
        assert.equal(wrong.status, 503);
        assert.equal(persists, before);
      },
    );
    await t.test(
      "Storage deletion failure keeps pending state and never finalizes cleanup",
      async () => {
        removeError = true;
        const before = finishes;
        const res = await handlePersistentDeletion(request(), context());
        assert.equal(res.status, 503);
        assert.match(await res.text(), /pending/);
        assert.equal(current.status, "deleting");
        assert.equal(finishes, before);
        assert.equal(exists, true);
        removeError = false;
      },
    );
    await t.test(
      "pending deletion prevents ingestion including explicit re-ingestion",
      async () => {
        const before = requests.length;
        assert.equal(
          (
            await handleIngestDocument(
              request({ id, reingest: true }),
              context(),
              embed,
            )
          ).status,
          409,
        );
        assert.equal(requests.length, before);
      },
    );
    await t.test(
      "database cleanup failure retains retry row after Storage is removed",
      async () => {
        cleanupError = true;
        const res = await handlePersistentDeletion(request(), context());
        assert.equal(res.status, 503);
        assert.match(await res.text(), /database cleanup is pending/);
        assert.equal(exists, false);
        assert.equal(current.status, "deleting");
        const listed = await handlePersistentList(
          new Request("http://localhost:3000/api/documents"),
          context(),
        );
        assert.equal(listed.status, 200);
        const body = await listed.json();
        assert.equal(body.documents[0].storageMissing, true);
        assert.equal(body.documents[0].ingestion.status, "deleting");
        cleanupError = false;
      },
    );
    await t.test(
      "retry deletion finishes an already removed PDF; missing documents return 404",
      async () => {
        assert.equal(
          (await handlePersistentDeletion(request(), context())).status,
          200,
        );
        assert.equal(current, null);
        assert.equal(
          (await handlePersistentDeletion(request(), context())).status,
          404,
        );
      },
    );
    await t.test(
      "repository uses authenticated ownership filters and narrow list columns",
      async () => {
        const repo = createKnowledgeRepository(client(), owner);
        assert.equal((await repo.get(id)).embeddingDimension, 384);
        assert.equal((await repo.list([id]))[0].storageName, id);
        await repo.pending(50);
        for (const req of requests.filter(
          (r) => new URL(r.url).pathname === "/rest/v1/documents",
        )) {
          const params = new URL(req.url).searchParams;
          assert.equal(params.get("owner_id"), `eq.${owner}`);
          assert.ok(!params.get("select").split(",").includes("embedding"));
        }
        assert.equal(
          new URL(requests.at(-1).url).searchParams.get("offset"),
          "50",
        );
      },
    );
    await t.test(
      "RPC serialization preserves chunk association and pgvector array syntax without client owner input",
      async () => {
        const repo = createKnowledgeRepository(client(), owner);
        const doc = await repo.persist(sourceSaved, resultSaved, true);
        assert.equal(doc.id, row.id);
        const body = await requests.at(-1).clone().json();
        assert.equal(body.p_storage_name, id);
        assert.equal(body.p_reingest, true);
        assert.equal(body.p_embedding_dimension, 384);
        assert.ok(!("owner_id" in body));
        assert.equal(body.p_file_size, bytes.length);
        body.p_chunks.forEach((c, i) => {
          assert.equal(c.content, resultSaved.chunks[i].text);
          assert.deepEqual(c.page_numbers, resultSaved.chunks[i].pageNumbers);
          assert.deepEqual(
            JSON.parse(c.embedding),
            resultSaved.chunks[i].embedding,
          );
        });
        assert.equal(await repo.beginDeletion(id), row.id);
        await repo.finishDeletion(id);
      },
    );
    await t.test(
      "database errors map to safe messages and conflict/not-found statuses",
      async () => {
        const repo = createKnowledgeRepository(client(), owner);
        for (const [code, status] of [
          ["P0001", 409],
          ["P0002", 404],
          ["42501", 503],
          ["23514", 503],
        ]) {
          rpcError = { code, message: "private-sql-details" };
          await assert.rejects(
            repo.persist(sourceSaved, resultSaved, true),
            (e) => e.status === status && !e.message.includes("private-sql"),
          );
        }
        rpcError = null;
      },
    );
    await t.test(
      "no external LLM, paid inference or other network requests occurred",
      () => assert.equal(networkAttempts, 0),
    );
  } finally {
    for (const [target, key, value] of saved) target[key] = value;
  }
});
