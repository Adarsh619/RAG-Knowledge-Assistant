import assert from "node:assert/strict";
import test from "node:test";
import { createClient } from "@supabase/supabase-js";
import { createPdfBytes } from "./storage-fixtures.mjs";
import {
  handleListDocuments,
  handleUploadDocument,
  handleDeleteDocument,
} from "../src/lib/storage/document-handler.ts";
import {
  MAX_PDF_BYTES,
  DOCUMENT_PAGE_SIZE,
  createDocumentId,
  isDocumentId,
  documentDisplayName,
  validatePdfSelection,
} from "../src/lib/storage/documents.ts";

test("Phase 4 document API with the official SDK and an offline Storage fixture", async (t) => {
  const userA = "00000000-0000-4000-8000-000000000001";
  const userB = "00000000-0000-4000-8000-000000000002";
  const objects = new Map();
  const calls = [];
  let unexpectedCalls = 0;
  let failStorage = false;
  async function fixtureFetch(input, options) {
    const request = new Request(input, options);
    const url = new URL(request.url);
    if (
      url.origin !== "https://storage.test" ||
      !url.pathname.startsWith("/storage/v1/")
    ) {
      unexpectedCalls += 1;
      throw new Error("Blocked a non-fixture request before network I/O.");
    }
    const call = { method: request.method, path: url.pathname };
    calls.push(call);
    if (failStorage)
      return Response.json(
        { statusCode: "503", message: "fixture-private-provider-detail" },
        { status: 503 },
      );
    if (url.pathname === "/storage/v1/object/list/documents") {
      const body = await request.json();
      call.prefix = body.prefix;
      const data = [...objects.entries()]
        .filter(([path]) => path.startsWith(`${body.prefix}/`))
        .reverse();
      return Response.json(
        data
          .slice(body.offset, body.offset + body.limit)
          .map(([, file]) => file),
      );
    }
    if (
      url.pathname === "/storage/v1/object/documents" &&
      request.method === "DELETE"
    ) {
      const body = await request.json();
      call.prefixes = body.prefixes;
      const deleted = [];
      for (const path of body.prefixes) {
        const file = objects.get(path);
        if (file) {
          deleted.push({ ...file, name: path });
          objects.delete(path);
        }
      }
      return Response.json(deleted);
    }
    if (
      url.pathname.startsWith("/storage/v1/object/documents/") &&
      request.method === "POST"
    ) {
      const path = url.pathname.slice("/storage/v1/object/documents/".length);
      const form = await request.formData();
      const file = [...form.values()].find((value) => value instanceof File);
      call.objectPath = path;
      call.upsert = request.headers.get("x-upsert");
      assert.ok(file);
      assert.equal(file.type, "application/pdf");
      assert.equal(form.get("cacheControl"), "0");
      const entry = {
        id: crypto.randomUUID(),
        name: path.split("/").pop(),
        created_at: "2026-10-08T10:00:00Z",
        updated_at: "2026-10-08T10:00:00Z",
        last_accessed_at: null,
        metadata: { size: file.size, mimetype: file.type },
      };
      objects.set(path, entry);
      return Response.json({ Id: entry.id, Key: `documents/${path}` });
    }
    throw new Error("Unexpected fixture endpoint.");
  }
  function context(userId = userA) {
    const client = createClient(
      "https://storage.test",
      "sb_publishable_offline_storage_fixture",
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
        global: { fetch: fixtureFetch },
      },
    );
    return { userId, storage: client.storage };
  }
  function uploadRequest(file, extra = {}, origin = "http://localhost:3000") {
    const form = new FormData();
    if (file) form.append("file", file);
    for (const [key, value] of Object.entries(extra)) form.append(key, value);
    return new Request("http://localhost:3000/api/documents", {
      method: "POST",
      body: form,
      headers: { origin },
    });
  }
  function deleteRequest(id, extra = {}, origin = "http://localhost:3000") {
    return new Request("http://localhost:3000/api/documents", {
      method: "DELETE",
      headers: { "Content-Type": "application/json", origin },
      body: JSON.stringify({ id, ...extra }),
    });
  }
  const pdf = () =>
    new File([createPdfBytes()], "Learning notes.pdf", {
      type: "application/pdf",
    });
  const listRequest = (offset = 0) =>
    new Request(`http://localhost:3000/api/documents?offset=${offset}`);
  let uploadedId;

  await t.test(
    "signed-out list/upload/delete return 401 before Storage",
    async () => {
      for (const response of [
        await handleListDocuments(listRequest(), null),
        await handleUploadDocument(uploadRequest(pdf()), null),
        await handleDeleteDocument(
          deleteRequest(createDocumentId("test.pdf")),
          null,
        ),
      ]) {
        assert.equal(response.status, 401);
        assert.match(
          response.headers.get("Cache-Control"),
          /private, no-store/,
        );
      }
      assert.equal(calls.length, 0);
    },
  );

  await t.test(
    "selection validation rejects wrong type, size and empty files",
    () => {
      assert.equal(validatePdfSelection(pdf()), null);
      for (const file of [
        { name: "notes.txt", type: "text/plain", size: 10 },
        { name: "notes.pdf", type: "image/png", size: 10 },
        { name: "notes.pdf", type: "application/pdf", size: MAX_PDF_BYTES + 1 },
        { name: "notes.pdf", type: "application/pdf", size: 0 },
      ])
        assert.ok(validatePdfSelection(file));
    },
  );

  await t.test(
    "generated names remove traversal and unsafe characters without collisions",
    () => {
      const ids = [
        "../../Résumé (draft).pdf",
        "\\folder\\notes.pdf",
        "💡.pdf",
        `${"a".repeat(300)}.pdf`,
      ].map(createDocumentId);
      assert.ok(ids.every(isDocumentId));
      assert.equal(documentDisplayName(ids[0]), "Resume-draft.pdf");
      assert.equal(documentDisplayName(ids[2]), "document.pdf");
      assert.notEqual(
        createDocumentId("notes.pdf"),
        createDocumentId("notes.pdf"),
      );
    },
  );

  await t.test(
    "valid PDF upload uses the verified user's folder and cannot overwrite",
    async () => {
      const response = await handleUploadDocument(
        uploadRequest(pdf()),
        context(),
      );
      assert.equal(response.status, 201);
      assert.match((await response.json()).message, /Learning-notes.pdf/);
      const call = calls.at(-1);
      assert.equal(call.upsert, "false");
      assert.ok(call.objectPath.startsWith(`${userA}/`));
      uploadedId = call.objectPath.split("/")[1];
      assert.ok(isDocumentId(uploadedId));
    },
  );

  await t.test(
    "server rejects unsupported, disguised, empty and oversized files",
    async () => {
      const count = calls.length;
      for (const [file, expectedStatus] of [
        [
          new File([createPdfBytes()], "not-pdf.txt", {
            type: "application/pdf",
          }),
          400,
        ],
        [
          new File([createPdfBytes()], "not-pdf.pdf", { type: "text/plain" }),
          400,
        ],
        [
          new File(["not a PDF"], "disguised.pdf", { type: "application/pdf" }),
          400,
        ],
        [new File([], "empty.pdf", { type: "application/pdf" }), 400],
        [
          new File([new Uint8Array(MAX_PDF_BYTES + 1)], "large.pdf", {
            type: "application/pdf",
          }),
          413,
        ],
      ])
        assert.equal(
          (await handleUploadDocument(uploadRequest(file), context())).status,
          expectedStatus,
        );
      assert.equal(calls.length, count);
    },
  );

  await t.test(
    "actual streamed size is bounded without Content-Length",
    async () => {
      let canceled = false;
      const stream = new ReadableStream({
        pull(controller) {
          controller.enqueue(new Uint8Array(128 * 1024));
        },
        cancel() {
          canceled = true;
        },
      });
      const request = new Request("http://localhost:3000/api/documents", {
        method: "POST",
        body: stream,
        duplex: "half",
        headers: { "Content-Type": "multipart/form-data; boundary=test" },
      });
      const count = calls.length;
      assert.equal(
        (await handleUploadDocument(request, context())).status,
        413,
      );
      assert.equal(canceled, true);
      assert.equal(calls.length, count);
    },
  );

  await t.test(
    "oversized declared requests fail before reading or Storage",
    async () => {
      const request = uploadRequest(pdf());
      request.headers.set("content-length", String(MAX_PDF_BYTES * 2));
      const count = calls.length;
      assert.equal(
        (await handleUploadDocument(request, context())).status,
        413,
      );
      assert.equal(calls.length, count);
    },
  );

  await t.test(
    "malformed forms and forged owner fields cannot upload",
    async () => {
      const count = calls.length;
      assert.equal(
        (await handleUploadDocument(uploadRequest(null), context())).status,
        400,
      );
      assert.equal(
        (
          await handleUploadDocument(
            uploadRequest(pdf(), { userId: userB }),
            context(),
          )
        ).status,
        400,
      );
      const form = new FormData();
      form.append("file", pdf());
      form.append("file", pdf());
      assert.equal(
        (
          await handleUploadDocument(
            new Request("http://localhost:3000/api/documents", {
              method: "POST",
              body: form,
            }),
            context(),
          )
        ).status,
        400,
      );
      assert.equal(calls.length, count);
    },
  );

  await t.test("cross-origin changes are rejected before Storage", async () => {
    const count = calls.length;
    assert.equal(
      (
        await handleUploadDocument(
          uploadRequest(pdf(), {}, "https://untrusted.test"),
          context(),
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await handleDeleteDocument(
          deleteRequest(uploadedId, {}, "https://untrusted.test"),
          context(),
        )
      ).status,
      403,
    );
    assert.equal(calls.length, count);
  });

  await t.test(
    "listing from a new context returns persisted name, size and date",
    async () => {
      const response = await handleListDocuments(listRequest(), context());
      const data = await response.json();
      assert.equal(response.status, 200);
      assert.equal(calls.at(-1).prefix, userA);
      assert.deepEqual(data.documents, [
        {
          id: uploadedId,
          name: "Learning-notes.pdf",
          size: createPdfBytes().length,
          uploadedAt: "2026-10-08T10:00:00Z",
        },
      ]);
      assert.equal(data.nextOffset, null);
    },
  );

  await t.test(
    "user B's API context cannot list or delete user A's document",
    async () => {
      const list = await handleListDocuments(listRequest(), context(userB));
      assert.deepEqual((await list.json()).documents, []);
      assert.equal(
        (await handleDeleteDocument(deleteRequest(uploadedId), context(userB)))
          .status,
        404,
      );
      assert.equal(calls.at(-1).prefixes[0], `${userB}/${uploadedId}`);
      assert.ok(objects.has(`${userA}/${uploadedId}`));
    },
  );

  await t.test(
    "arbitrary paths, owner IDs and traversal cannot be submitted for deletion",
    async () => {
      const count = calls.length;
      for (const id of [`${userA}/${uploadedId}`, `../${uploadedId}`, "", 42]) {
        assert.equal(
          (await handleDeleteDocument(deleteRequest(id), context(userB)))
            .status,
          400,
        );
      }
      assert.equal(
        (
          await handleDeleteDocument(
            deleteRequest(uploadedId, { userId: userA }),
            context(userB),
          )
        ).status,
        400,
      );
      assert.equal(calls.length, count);
    },
  );

  await t.test(
    "pagination exposes the next page rather than truncating the library",
    async () => {
      for (let index = 0; index < DOCUMENT_PAGE_SIZE; index++) {
        const id = createDocumentId(`page-${index}.pdf`);
        objects.set(`${userA}/${id}`, {
          id: crypto.randomUUID(),
          name: id,
          created_at: "2026-10-08T10:00:00Z",
          metadata: { size: 10 },
        });
      }
      const first = await (
        await handleListDocuments(listRequest(), context())
      ).json();
      assert.equal(first.documents.length, DOCUMENT_PAGE_SIZE);
      assert.equal(first.nextOffset, DOCUMENT_PAGE_SIZE);
      const second = await (
        await handleListDocuments(listRequest(first.nextOffset), context())
      ).json();
      assert.equal(second.documents.length, 1);
      assert.equal(second.nextOffset, null);
    },
  );

  await t.test("invalid list offsets fail before Storage", async () => {
    const count = calls.length;
    for (const offset of ["-1", "NaN", "1.5", "1000000"]) {
      assert.equal(
        (await handleListDocuments(listRequest(offset), context())).status,
        400,
      );
    }
    assert.equal(calls.length, count);
  });

  await t.test(
    "Storage errors are handled without exposing provider details",
    async () => {
      failStorage = true;
      try {
        for (const response of [
          await handleListDocuments(listRequest(), context()),
          await handleUploadDocument(uploadRequest(pdf()), context()),
          await handleDeleteDocument(deleteRequest(uploadedId), context()),
        ]) {
          assert.equal(response.status, 503);
          assert.ok(
            !(await response.text()).includes(
              "fixture-private-provider-detail",
            ),
          );
        }
      } finally {
        failStorage = false;
      }
    },
  );

  await t.test(
    "owner deletion removes the object through Storage",
    async () => {
      const response = await handleDeleteDocument(
        deleteRequest(uploadedId),
        context(),
      );
      assert.equal(response.status, 200);
      assert.equal(objects.has(`${userA}/${uploadedId}`), false);
      assert.equal(
        (await handleDeleteDocument(deleteRequest(uploadedId), context()))
          .status,
        404,
      );
    },
  );

  await t.test("fixture requests never reach a real project or an LLM", () => {
    assert.ok(calls.length > 0);
    assert.equal(unexpectedCalls, 0);
  });
});
