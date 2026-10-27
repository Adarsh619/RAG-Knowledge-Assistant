import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { handleConversations, handleConversation, handleConversationTurn } from "../src/lib/conversations/handler.ts";
import { ConversationError, createConversationRepository } from "../src/lib/conversations/repository.ts";
import { buildRagSources } from "../src/lib/rag/sources.ts";
import { readTurnResponse } from "../src/lib/http/client-response.ts";
import { createEmbeddedProvider } from "../src/lib/ai/providers/embedded.ts";

const id = "00000000-0000-4000-8000-000000000001";
const doc = "00000000-0000-4000-8000-000000000002";
const now = new Date().toISOString();
const parent = { id, title: "Saved learning", documentId: null, createdAt: now, updatedAt: now };
const evidence = buildRagSources([{ documentId: doc, chunkId: randomUUID(), originalFilename: "react.pdf",
  chunkIndex: 0, pageNumbers: [1, 3], similarity: 0.8, content: "Cedar uses React. useState stores state." }]);
const answer = { mode: "local", message: { role: "assistant", content: "Cedar uses useState for state." },
  sources: evidence, rag: { status: "generated", model: "qwen3:4b-instruct", retrievedChunkCount: 1, contextChunkCount: 1, contextBytes: 80 } };
function request(body, method = "POST", extra = {}) {
  return new Request(`http://localhost/api/conversations/${id}/messages`, {
    method, headers: { "Content-Type": "application/json", ...extra },
    ...(method === "GET" ? {} : { body: JSON.stringify(body) }),
  });
}

// An offline transaction fixture exercises the handler's pending/completed protocol.
// Real PostgreSQL policies and constraints are checked separately against the deployed migration.
function fixture(owner = true) {
  const rows = new Map(); let begins = 0, completions = 0;
  const own = () => { if (!owner) throw new ConversationError("Conversation is unavailable.", 404); };
  const context = { repository: { search: async () => assert.fail("No direct search in persistence tests") }, conversations: {
    async list() { return { conversations: owner ? [parent] : [], nextOffset: null }; },
    async create(scope) { return { ...parent, documentId: scope }; },
    async get() { own(); return { conversation: parent, messages: [...rows.values()].flatMap(pair => pair.assistant ? [pair.user, pair.assistant] : [pair.user]), nextOffset: null }; },
    async remove() { own(); rows.clear(); },
    async begin(cid, rid, content, scope) {
      own(); begins++;
      let pair = rows.get(rid);
      if (pair && (pair.user.content !== content || pair.user.documentId !== scope)) throw new ConversationError("Conflicting request ID", 400);
      if (pair?.user.status === "completed") return { conversation: parent, userMessage: pair.user, assistantMessage: pair.assistant, attemptId: "internal-token" };
      if ([...rows.values()].some(item => item.user.status === "pending")) throw new ConversationError("Reply pending", 409);
      const token = randomUUID();
      if (!pair) pair = { user: { id: randomUUID(), conversationId: cid, requestId: rid, turnIndex: rows.size,
        role: "user", content, documentId: scope, status: "pending", sources: [], createdAt: now, startedAt: now } };
      pair.user.status = "pending"; pair.attempt = token; rows.set(rid, pair);
      return { conversation: parent, userMessage: pair.user, assistantMessage: null, attemptId: token };
    },
    async complete(cid, rid, token, reply) {
      own(); const pair = rows.get(rid);
      assert.equal(pair.attempt, token);
      pair.assistant = { ...pair.user, id: randomUUID(), role: "assistant", status: "completed",
        content: reply.message.content, mode: reply.mode, sources: structuredClone(reply.sources), rag: structuredClone(reply.rag) };
      pair.user.status = "completed"; completions++;
      return { conversation: parent, userMessage: pair.user, assistantMessage: pair.assistant };
    },
    async fail(cid, rid, token) { const pair = rows.get(rid); if (pair?.attempt === token && pair.user.status === "pending") pair.user.status = "failed"; },
  } };
  return { context, rows, counts: () => ({ begins, completions }) };
}

test("persistent chat protocol with all external fetch blocked", async t => {
  const previous = process.env.LLM_MODE, originalFetch = globalThis.fetch;
  process.env.LLM_MODE = "local";
  let outbound = 0;
  globalThis.fetch = () => { outbound++; assert.fail("External inference is forbidden"); };
  try {
    await t.test("authentication and same-origin checks precede all persistence/generation", async () => {
      const { context, counts } = fixture();
      assert.equal((await handleConversationTurn(request({}), null, id)).status, 401);
      assert.equal((await handleConversationTurn(request({}, "POST", { origin: "https://evil.test" }), context, id)).status, 403);
      assert.equal(counts().begins, 0);
    });
    await t.test("empty/oversized questions, invalid UUIDs and forged sources are rejected before saving", async () => {
      const { context, counts } = fixture();
      for (const body of [{ message: " ", requestId: randomUUID() }, { message: "x".repeat(4001), requestId: randomUUID() },
        { message: "React?", requestId: "bad" }, { message: "React?", requestId: randomUUID(), sources: evidence },
        { message: "React?", requestId: randomUUID(), owner_id: "other" }, { message: "React?", requestId: randomUUID(), documentId: "bad" }]) {
        assert.equal((await handleConversationTurn(request(body), context, id)).status, 400);
      }
      assert.equal(counts().begins, 0);
    });
    await t.test("question is pending before RAG; original source snapshots survive reload without generation", async () => {
      const { context, rows } = fixture(); const rid = randomUUID();
      const response = await handleConversationTurn(request({ message: "React?", requestId: rid, documentId: doc }), context, id, async req => {
        assert.equal(rows.get(rid).user.status, "pending");
        assert.deepEqual(await req.json(), { message: "React?", documentId: doc, chatMode: "documents" }); // No history or client evidence sent.
        return Response.json(answer);
      });
      const saved = await response.json();
      assert.equal(response.status, 200); assert.equal(saved.userMessage.status, "completed");
      assert.deepEqual(saved.assistantMessage.sources, evidence);
      assert.ok(!JSON.stringify(saved).includes("attemptId"));
      const restored = await (await handleConversation(request({}, "GET"), context, id)).json();
      assert.deepEqual(restored.messages[1], saved.assistantMessage);
    });
    await t.test("completed request replay returns the saved answer and does not call the model again", async () => {
      const { context, counts } = fixture(); const body = { message: "React?", requestId: randomUUID() };
      const first = await (await handleConversationTurn(request(body), context, id, async () => Response.json(answer))).json();
      const second = await (await handleConversationTurn(request(body), context, id, async () => assert.fail("Replay must not regenerate"))).json();
      assert.deepEqual(second, first); assert.equal(counts().completions, 1);
    });
    await t.test("general answer provenance survives reload and cannot replay as a document answer", async () => {
      const { context } = fixture();
      const body = { message: "What is photosynthesis?", requestId: randomUUID(), chatMode: "general" };
      const general = { ...answer, content: "Plants convert light into chemical energy.", sources: [], rag: { ...answer.rag, status: "general", chatMode: "general", retrievedChunkCount: 0, contextChunkCount: 0, contextBytes: 0 } };
      const response = await handleConversationTurn(request(body), context, id, async req => {
        assert.equal((await req.json()).chatMode, "general");
        return Response.json(general);
      });
      assert.equal(response.status, 200);
      const saved = await response.json();
      assert.deepEqual(saved.assistantMessage.sources, []);
      assert.equal(saved.assistantMessage.rag.status, "general");
      const restored = await (await handleConversation(request({}, "GET"), context, id)).json();
      assert.equal(restored.messages[1].rag.chatMode, "general");
      assert.equal((await handleConversationTurn(request({ ...body, chatMode: "documents" }), context, id, async () => assert.fail("Must not regenerate"))).status, 409);
    });
    await t.test("failed local generation keeps one failed question and no assistant; retry uses the same request ID", async () => {
      const { context, rows } = fixture(); const body = { message: "React?", requestId: randomUUID() };
      assert.equal((await handleConversationTurn(request(body), context, id, async () => Response.json({ error: "Ollama unavailable" }, { status: 503 }))).status, 503);
      assert.equal(rows.size, 1); assert.equal(rows.get(body.requestId).user.status, "failed");
      assert.equal(rows.get(body.requestId).assistant, undefined);
      assert.equal((await handleConversationTurn(request(body), context, id, async () => Response.json(answer))).status, 200);
      assert.equal(rows.size, 1); assert.equal(rows.get(body.requestId).user.status, "completed");
    });
    await t.test("a pending request blocks a concurrent request without a second generation", async () => {
      const { context } = fixture(); const rid = randomUUID();
      await context.conversations.begin(id, rid, "React?", null);
      assert.equal((await handleConversationTurn(request({ message: "New question?", requestId: randomUUID() }), context, id,
        async () => assert.fail("Pending turns must not run another generator"))).status, 409);
    });
    await t.test("completion failure leaves a failed question and no falsely completed assistant", async () => {
      const { context, rows } = fixture(); const rid = randomUUID();
      context.conversations.complete = async () => { throw new ConversationError("Database unavailable"); };
      assert.equal((await handleConversationTurn(request({ message: "React?", requestId: rid }), context, id,
        async () => Response.json(answer))).status, 503);
      assert.equal(rows.get(rid).user.status, "failed"); assert.equal(rows.get(rid).assistant, undefined);
    });
    await t.test("lost completion response cannot downgrade the committed pair; replay recovers it", async () => {
      const { context, rows } = fixture(); const rid = randomUUID(), complete = context.conversations.complete;
      context.conversations.complete = async (...args) => { await complete(...args); throw new Error("Lost response after commit"); };
      assert.equal((await handleConversationTurn(request({ message: "React?", requestId: rid }), context, id,
        async () => Response.json(answer))).status, 503);
      assert.equal(rows.get(rid).user.status, "completed");
      const restored = await (await handleConversationTurn(request({ message: "React?", requestId: rid }), context, id,
        async () => assert.fail("Committed answer must be replayed"))).json();
      assert.deepEqual(restored.assistantMessage.sources, evidence); assert.equal(rows.size, 1);
    });
    await t.test("changed text on a reused request ID is rejected", async () => {
      const { context } = fixture(); const rid = randomUUID();
      await handleConversationTurn(request({ message: "React?", requestId: rid }), context, id, async () => Response.json(answer));
      assert.equal((await handleConversationTurn(request({ message: "Different?", requestId: rid }), context, id)).status, 400);
    });
    await t.test("insufficient context persists a completed explanation with zero sources", async () => {
      const { context } = fixture();
      const response = await handleConversationTurn(request({ message: "Unrelated?", requestId: randomUUID() }), context, id,
        async () => Response.json({ ...answer, sources: [], rag: { ...answer.rag, status: "insufficient_context", model: null, contextChunkCount: 0 } }));
      const saved = await response.json(); assert.deepEqual(saved.assistantMessage.sources, []);
      assert.equal(saved.assistantMessage.rag.status, "insufficient_context");
    });
    await t.test("User B cannot list, open, append or delete User A's conversation", async () => {
      const { context } = fixture(false);
      assert.deepEqual((await (await handleConversations(request({}, "GET"), context)).json()).conversations, []);
      assert.equal((await handleConversation(request({}, "GET"), context, id)).status, 404);
      assert.equal((await handleConversation(request({}, "DELETE"), context, id)).status, 404);
      assert.equal((await handleConversationTurn(request({ message: "React?", requestId: randomUUID() }), context, id,
        async () => assert.fail("Foreign conversation must never generate"))).status, 404);
    });
    await t.test("conversation delete removes its messages; no document operation is called", async () => {
      const { context, rows } = fixture();
      await handleConversationTurn(request({ message: "React?", requestId: randomUUID() }), context, id, async () => Response.json(answer));
      assert.equal(rows.size, 1); assert.equal((await handleConversation(request({}, "DELETE"), context, id)).status, 200);
      assert.equal(rows.size, 0);
    });
    await t.test("OpenAI mode is disabled before saving even when a key exists", async () => {
      process.env.LLM_MODE = "openai"; const { context, counts } = fixture();
      assert.equal((await handleConversationTurn(request({ message: "React?", requestId: randomUUID() }), context, id)).status, 503);
      assert.equal(counts().begins, 0); process.env.LLM_MODE = "local";
    });
    await t.test("the real mock handler can persist a reply without retrieval or network", async () => {
      process.env.LLM_MODE = "mock"; const { context } = fixture();
      const data = await (await handleConversationTurn(request({ message: "Hello backend", requestId: randomUUID() }), context, id)).json();
      assert.equal(data.assistantMessage.mode, "mock"); assert.match(data.assistantMessage.content, /mock/i);
      assert.deepEqual(data.assistantMessage.sources, []); process.env.LLM_MODE = "local";
    });
    assert.equal(outbound, 0);
  } finally { globalThis.fetch = originalFetch; if (previous === undefined) delete process.env.LLM_MODE; else process.env.LLM_MODE = previous; }
});

test("streamed turns send text as generated, then save and return the same final body", async t => {
  const previous = process.env.LLM_MODE; process.env.LLM_MODE = "local";
  const streamRequest = body => request(body, "POST", { Accept: "application/x-ndjson, application/json" });
  const events = async response => (await response.text()).trim().split("\n").map(line => JSON.parse(line));
  try {
    await t.test("deltas arrive before the saved answer; persistence happens once", async () => {
      const { context, rows, counts } = fixture(); const rid = randomUUID();
      const response = await handleConversationTurn(streamRequest({ message: "React?", requestId: rid }), context, id,
        async (req, ctx, runRag, runGeneral, onText) => {
          onText("Cedar uses "); onText(""); onText("useState for state.");
          assert.equal(rows.get(rid).user.status, "pending"); // Nothing is saved while streaming.
          return Response.json(answer);
        });
      assert.match(response.headers.get("content-type"), /^application\/x-ndjson/);
      assert.equal(response.headers.get("cache-control"), "private, no-store");
      const received = await events(response);
      assert.deepEqual(received.slice(0, 2), [{ type: "delta", text: "Cedar uses " }, { type: "delta", text: "useState for state." }]);
      assert.equal(received.length, 3); assert.equal(received[2].type, "done");
      assert.equal(received[2].data.assistantMessage.content, answer.message.content);
      assert.deepEqual(received[2].data.assistantMessage.sources, evidence);
      assert.ok(!JSON.stringify(received).includes("attemptId"));
      assert.equal(counts().completions, 1); assert.equal(rows.get(rid).user.status, "completed");
    });
    await t.test("a failed generation streams a sanitized error and marks only that attempt failed", async () => {
      const { context, rows, counts } = fixture(); const rid = randomUUID();
      const response = await handleConversationTurn(streamRequest({ message: "React?", requestId: rid }), context, id,
        async (req, ctx, runRag, runGeneral, onText) => { onText("partial"); return Response.json({ error: "The local generator is busy. Try again shortly." }, { status: 409 }); });
      const received = await events(response);
      assert.deepEqual(received.at(-1), { type: "error", status: 409, error: "The local generator is busy. Try again shortly." });
      assert.equal(rows.get(rid).user.status, "failed"); assert.equal(counts().completions, 0);
      const thrown = await handleConversationTurn(streamRequest({ message: "Again?", requestId: randomUUID() }), context, id,
        async () => { throw new Error("secret native trace"); });
      const last = (await events(thrown)).at(-1);
      assert.equal(last.type, "error"); assert.doesNotMatch(last.error, /secret/);
    });
    await t.test("validation errors and saved replays stay ordinary JSON", async () => {
      const { context } = fixture(); const body = { message: "React?", requestId: randomUUID() };
      const invalid = await handleConversationTurn(streamRequest({ message: " ", requestId: randomUUID() }), context, id);
      assert.equal(invalid.status, 400); assert.match(invalid.headers.get("content-type"), /^application\/json/);
      await (await handleConversationTurn(request(body), context, id, async () => Response.json(answer))).json();
      const replay = await handleConversationTurn(streamRequest(body), context, id, async () => assert.fail("Replay must not regenerate"));
      assert.match(replay.headers.get("content-type"), /^application\/json/);
      assert.equal((await replay.json()).assistantMessage.content, answer.message.content);
    });
    await t.test("without the stream Accept header the original JSON contract is unchanged", async () => {
      const { context } = fixture();
      const response = await handleConversationTurn(request({ message: "React?", requestId: randomUUID() }), context, id,
        async (req, ctx, runRag, runGeneral, onText) => { assert.equal(onText, undefined); return Response.json(answer); });
      assert.match(response.headers.get("content-type"), /^application\/json/);
      assert.equal((await response.json()).assistantMessage.content, answer.message.content);
    });
  } finally { if (previous === undefined) delete process.env.LLM_MODE; else process.env.LLM_MODE = previous; }
});

test("browser stream reader handles split lines, errors, truncation and JSON fallback", async () => {
  const stream = (...parts) => new Response(new ReadableStream({ start(controller) {
    for (const part of parts) controller.enqueue(new TextEncoder().encode(part)); controller.close();
  } }), { headers: { "Content-Type": "application/x-ndjson; charset=utf-8" } });
  const texts = [];
  const data = await readTurnResponse(stream('{"type":"delta","te', 'xt":"Hel"}\n{"type":"delta","text":"lo"}\n', '{"type":"done","data":{"ok":true}}\n'), text => texts.push(text));
  assert.deepEqual(texts, ["Hel", "lo"]); assert.deepEqual(data, { ok: true });
  await assert.rejects(readTurnResponse(stream('{"type":"error","status":409,"error":"Busy."}\n'), () => {}), /Busy\./);
  await assert.rejects(readTurnResponse(stream('{"type":"error","status":401,"error":"raw"}\n'), () => {}), /Sign in again/);
  await assert.rejects(readTurnResponse(stream('{"type":"delta","text":"cut"}\n'), () => {}), /ended unexpectedly/);
  await assert.rejects(readTurnResponse(stream("<html>proxy</html>\n"), () => {}), e => /unreadable/.test(e.message) && !/proxy/.test(e.message));
  assert.deepEqual(await readTurnResponse(Response.json({ ok: 1 }), () => assert.fail("No deltas")), { ok: 1 });
  await assert.rejects(readTurnResponse(Response.json({ error: "Nope." }, { status: 400 }), () => {}), /Nope\./);
});

test("embedded provider forwards generated text to the stream callback", async () => {
  const pieces = [];
  const provider = createEmbeddedProvider(async () => ({ async generate(messages, options) {
    options.onText?.("Hello "); options.onText?.("world."); return { text: "Hello world.", finished: true };
  } }));
  assert.equal(await provider.reply("question", { system: "Answer.", onText: text => pieces.push(text) }), "Hello world.");
  assert.deepEqual(pieces, ["Hello ", "world."]);
});

test("real Supabase repository mappings and narrowly scoped mutations, offline", async t => {
  const owner = randomUUID(); const requestId = randomUUID(), attemptId = randomUUID(); const calls = [];
  const row = { id, owner_id: owner, title: parent.title, document_id: doc, created_at: now, updated_at: now };
  const user = { id: randomUUID(), conversation_id: id, request_id: requestId, turn_index: 0, role: "user", content: "React?",
    status: "completed", attempt_id: attemptId, document_id: doc, sources: [], mode: null, rag: null, created_at: now, started_at: now };
  const assistant = { ...user, id: randomUUID(), role: "assistant", attempt_id: null, mode: "local", sources: evidence, rag: answer.rag, content: answer.message.content };
  let operationError = null;
  const client = createClient("https://offline.test", "sb_publishable_offline_fixture", {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: async (input, init) => {
      const req = new Request(input, init), url = new URL(req.url); assert.equal(url.origin, "https://offline.test");
      const parsed = req.method === "GET" || req.method === "DELETE" ? null : await req.json();
      calls.push({ method: req.method, url, body: parsed });
      if (operationError) return Response.json(operationError, { status: 403 });
      if (url.pathname.includes("/rpc/")) return Response.json({ conversation: row, user_message: user, assistant_message: assistant });
      if (url.pathname.endsWith("/messages")) return Response.json(req.method === "PATCH" ? null : [assistant, user]);
      if (req.method === "POST") return Response.json(row, { status: 201 });
      return Response.json(req.headers.get("accept")?.includes("object") ? row : [row]);
    } },
  });
  const repository = createConversationRepository(client, owner);
  await t.test("listing/reading preserves citations and scopes without exposing attempt tokens", async () => {
    assert.equal((await repository.list()).conversations[0].documentId, doc);
    const saved = await repository.get(id);
    assert.deepEqual(saved.messages.map(item => item.role), ["user", "assistant"]);
    assert.deepEqual(saved.messages[1].sources, evidence); assert.ok(!("attemptId" in saved.messages[0]));
    assert.equal(calls[0].url.searchParams.get("owner_id"), `eq.${owner}`);
  });
  await t.test("creation takes owner from verified server context, not browser input", async () => {
    await repository.create(doc); assert.deepEqual(calls.at(-1).body, { owner_id: owner, document_id: doc });
  });
  await t.test("completion saves the original source array/rag metadata in the atomic RPC", async () => {
    await repository.complete(id, requestId, attemptId, answer);
    assert.deepEqual(calls.at(-1).body.p_sources, evidence);
    assert.equal(calls.at(-1).body.p_attempt_id, attemptId);
  });
  await t.test("failure updates only the matching pending user attempt", async () => {
    await repository.fail(id, requestId, attemptId); const call = calls.at(-1);
    assert.deepEqual(call.body, { status: "failed" });
    for (const [key, value] of Object.entries({ conversation_id: id, request_id: requestId, attempt_id: attemptId, role: "user", status: "pending" }))
      assert.equal(call.url.searchParams.get(key), `eq.${value}`);
  });
  await t.test("conversation deletion is restricted by ID and verified owner", async () => {
    await repository.remove(id); const call = calls.at(-1);
    assert.equal(call.method, "DELETE"); assert.equal(call.url.searchParams.get("id"), `eq.${id}`);
    assert.equal(call.url.searchParams.get("owner_id"), `eq.${owner}`);
  });
  await t.test("RLS denial is surfaced safely and contains no raw database detail", async () => {
    operationError = { code: "42501", message: "sensitive SQL detail" };
    await assert.rejects(() => repository.begin(id, requestId, "React?", null), cause => cause.status === 403 && !cause.message.includes("sensitive"));
  });
});
