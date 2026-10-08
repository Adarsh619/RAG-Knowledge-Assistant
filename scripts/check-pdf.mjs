import assert from "node:assert/strict";
import test from "node:test";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import tls from "node:tls";
import { createClient } from "@supabase/supabase-js";
import { createTextPdf, corruptPdf } from "./pdf-fixtures.mjs";
import { CHUNKING_TEST_PAGES } from "./chunking-fixtures.mjs";
import { MAX_PDF_BYTES } from "../src/lib/storage/documents.ts";

test("Real PDF parser and authenticated extraction-to-chunking pipeline, with no outbound network", async (t) => {
  const saved = [];
  let outboundAttempts = 0;
  function block(target, key) {
    saved.push([target, key, target[key]]);
    target[key] = () => {
      outboundAttempts++;
      throw new Error("Blocked outbound network before I/O.");
    };
  }
  block(globalThis, "fetch");
  for (const target of [http, https]) {
    block(target, "request");
    block(target, "get");
  }
  for (const target of [net, tls]) {
    block(target, "connect");
  }
  block(net, "createConnection");
  try {
    const { extractPdfText, PdfExtractionError } = await import(
      "../src/lib/pdf/extract-text.ts"
    );
    const { handleExtractDocument } = await import(
      "../src/lib/pdf/extraction-handler.ts"
    );
    const userA = "00000000-0000-4000-8000-000000000001";
    const userB = "00000000-0000-4000-8000-000000000002";
    const id = "00000000-0000-4000-8000-000000000003--phase-5-text-test.pdf";
    let downloadBytes = createTextPdf();
    let failure = null;
    const downloads = [];
    function context(userId = userA) {
      const client = createClient(
        "https://storage.test",
        "sb_publishable_offline_pdf_fixture",
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
              const expectedPath = `/storage/v1/object/documents/${userA}/${id}`;
              downloads.push(url.pathname);
              if (failure)
                return Response.json(
                  {
                    statusCode: String(failure),
                    message: "fixture-private-storage-detail",
                  },
                  { status: failure },
                );
              if (url.pathname !== expectedPath)
                return Response.json(
                  { statusCode: "404", message: "Object not found" },
                  { status: 404 },
                );
              return new Response(downloadBytes, {
                headers: { "Content-Type": "application/pdf" },
              });
            },
          },
        },
      );
      return { userId, storage: client.storage };
    }
    function request(body = { id }, headers = {}) {
      return new Request("http://localhost:3000/api/documents/extract", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "http://localhost:3000",
          ...headers,
        },
        body: typeof body === "string" ? body : JSON.stringify(body),
      });
    }
    await t.test(
      "readable text and physical page numbers survive real parsing",
      async () => {
        const result = await extractPdfText(createTextPdf());
        assert.equal(result.pageCount, 2);
        assert.deepEqual(result.pages, [
          { pageNumber: 1, text: "Phase 5 local PDF extraction" },
          { pageNumber: 2, text: "Page two preserves its source page number." },
        ]);
        assert.equal(result.characterCount, 70);
        assert.equal(result.status, "extracted");
      },
    );
    await t.test(
      "blank and image-only PDFs return no_text without OCR",
      async () => {
        for (const input of ["", null]) {
          const result = await extractPdfText(createTextPdf([input]));
          assert.equal(result.status, "no_text");
          assert.equal(result.pageCount, 1);
          assert.equal(result.emptyPageCount, 1);
          assert.equal(result.characterCount, 0);
        }
      },
    );
    await t.test(
      "small text and empty pages are preserved accurately",
      async () => {
        const result = await extractPdfText(createTextPdf(["", "OK"]));
        assert.equal(result.status, "extracted");
        assert.equal(result.characterCount, 2);
        assert.deepEqual(result.pages, [
          { pageNumber: 1, text: "" },
          { pageNumber: 2, text: "OK" },
        ]);
      },
    );
    await t.test("corrupt PDF throws a safe parser error", async () => {
      await assert.rejects(
        extractPdfText(corruptPdf),
        (error) =>
          error instanceof PdfExtractionError &&
          error.status === 422 &&
          !error.message.includes("deliberately"),
      );
    });
    await t.test(
      "page-count cap rejects a tiny but excessive-page PDF",
      async () => {
        await assert.rejects(
          extractPdfText(createTextPdf(Array(101).fill(""))),
          /up to 100 pages/,
        );
      },
    );
    await t.test("character cap rejects excessive decoded text", async () => {
      await assert.rejects(
        extractPdfText(
          createTextPdf(
            Array(80).fill(Array(45).fill("A".repeat(60)).join("\n")),
          ),
        ),
        /200,000 characters/,
      );
    });
    await t.test(
      "input byte cap matches the unchanged 4 MiB limit",
      async () => {
        for (const bytes of [
          new Uint8Array(),
          new Uint8Array(MAX_PDF_BYTES + 1),
        ]) {
          await assert.rejects(
            extractPdfText(bytes),
            (error) => error.status === 413,
          );
        }
      },
    );
    await t.test(
      "signed-out requests return 401 without downloading",
      async () => {
        const before = downloads.length;
        assert.equal(
          (await handleExtractDocument(request(), null)).status,
          401,
        );
        assert.equal(downloads.length, before);
      },
    );
    await t.test(
      "authenticated owner downloads only their path and receives text",
      async () => {
        const response = await handleExtractDocument(request(), context());
        assert.equal(response.status, 200);
        assert.equal(
          response.headers.get("Cache-Control"),
          "private, no-store",
        );
        const body = await response.json();
        assert.equal(body.document.name, "phase-5-text-test.pdf");
        assert.equal(body.extraction.pages[1].pageNumber, 2);
        assert.match(body.extraction.pages[0].text, /Phase 5/);
        assert.equal(body.chunking.chunks.length, 1);
        assert.equal(body.chunking.sourceCharacterCount, 72);
        assert.deepEqual(body.chunking.chunks[0].pageNumbers, [1, 2]);
        assert.equal(body.chunking.chunks[0].documentId, id);
        assert.equal(
          body.chunking.chunks[0].text,
          body.extraction.pages.map((page) => page.text).join("\n\n"),
        );
        assert.ok(downloads.at(-1).includes(`/${userA}/${id}`));
      },
    );
    await t.test(
      "a different user's ID cannot download the owner's object",
      async () => {
        const response = await handleExtractDocument(request(), context(userB));
        assert.equal(response.status, 404);
        assert.ok(downloads.at(-1).includes(`/${userB}/${id}`));
        assert.doesNotMatch(await response.text(), /Phase 5 local/);
      },
    );
    await t.test(
      "forged paths, owner fields, and malformed IDs never reach Storage",
      async () => {
        const before = downloads.length;
        for (const body of [
          { id: `${userA}/${id}` },
          { id: `../${id}` },
          { id, userId: userA },
          { id: "bad.pdf" },
          {},
          null,
        ]) {
          assert.equal(
            (await handleExtractDocument(request(body), context())).status,
            400,
          );
        }
        assert.equal(downloads.length, before);
      },
    );
    await t.test(
      "invalid JSON, content type, and oversized bodies are rejected",
      async () => {
        assert.equal(
          (await handleExtractDocument(request("{"), context())).status,
          400,
        );
        assert.equal(
          (
            await handleExtractDocument(
              request({}, { "Content-Type": "text/plain" }),
              context(),
            )
          ).status,
          415,
        );
        assert.equal(
          (await handleExtractDocument(request(" ".repeat(1025)), context()))
            .status,
          413,
        );
      },
    );
    await t.test("cross-origin extraction requests are rejected", async () => {
      const before = downloads.length;
      assert.equal(
        (
          await handleExtractDocument(
            request({ id }, { Origin: "https://other.test" }),
            context(),
          )
        ).status,
        403,
      );
      assert.equal(downloads.length, before);
    });
    await t.test(
      "download outages expose no private provider detail",
      async () => {
        failure = 503;
        const response = await handleExtractDocument(request(), context());
        assert.equal(response.status, 503);
        assert.doesNotMatch(await response.text(), /fixture-private/);
        failure = null;
      },
    );
    await t.test(
      "stored corrupt PDFs return 422 rather than crashing the route",
      async () => {
        downloadBytes = corruptPdf;
        assert.equal(
          (await handleExtractDocument(request(), context())).status,
          422,
        );
      },
    );
    await t.test(
      "stored missing-header and oversized files are independently rejected",
      async () => {
        downloadBytes = Buffer.from("not a PDF");
        assert.equal(
          (await handleExtractDocument(request(), context())).status,
          422,
        );
        downloadBytes = Buffer.alloc(MAX_PDF_BYTES + 1);
        assert.equal(
          (await handleExtractDocument(request(), context())).status,
          413,
        );
      },
    );
    await t.test(
      "image-only owner extraction completes with an empty result",
      async () => {
        downloadBytes = createTextPdf([null]);
        const response = await handleExtractDocument(request(), context());
        assert.equal(response.status, 200);
        const body = await response.json();
        assert.equal(body.extraction.status, "no_text");
        assert.equal(body.chunking.chunks.length, 0);
        assert.equal(body.chunking.sourceCharacterCount, 0);
      },
    );
    await t.test(
      "multi-page owner PDF yields bounded, overlapping, lossless chunks with physical pages",
      async () => {
        downloadBytes = createTextPdf(CHUNKING_TEST_PAGES);
        const response = await handleExtractDocument(request(), context());
        assert.equal(response.status, 200);
        const body = await response.json();
        assert.equal(body.extraction.pageCount, 3);
        assert.equal(body.extraction.emptyPageCount, 1);
        assert.equal(body.extraction.pages[1].text, "");
        const source = body.extraction.pages
          .filter((page) => page.text)
          .map((page) => page.text)
          .join("\n\n");
        let reconstructed = "";
        let previousEnd = 0;
        const { chunks, options } = body.chunking;
        assert.ok(chunks.length > 1);
        assert.ok(
          chunks.some((chunk) => chunk.pageNumbers.join(",") === "1,3"),
        );
        assert.ok(chunks.some((chunk) => chunk.overlapWithPrevious > 0));
        for (const chunk of chunks) {
          assert.equal(chunk.documentId, id);
          assert.ok(chunk.characterCount <= options.maxCharacters);
          assert.ok(chunk.overlapWithPrevious <= options.overlapCharacters);
          assert.ok(!chunk.pageNumbers.includes(2));
          assert.equal(
            chunk.text,
            source.slice(chunk.startOffset, chunk.endOffset),
          );
          reconstructed += chunk.text.slice(previousEnd - chunk.startOffset);
          previousEnd = chunk.endOffset;
        }
        assert.equal(reconstructed, source);
        assert.equal(body.chunking.sourceCharacterCount, source.length);
      },
    );
    await t.test(
      "parser and pipeline made zero outbound network attempts",
      () => {
        assert.equal(outboundAttempts, 0);
      },
    );
  } finally {
    for (const [target, key, value] of saved) target[key] = value;
  }
});
