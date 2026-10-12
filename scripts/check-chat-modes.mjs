import assert from "node:assert/strict";
import test from "node:test";
import { handleChatRequest } from "../src/lib/ai/chat-handler.ts";
import { answerGenerally, GENERAL_SYSTEM_PROMPT } from "../src/lib/ai/general.ts";
import { parseChatMode, documentChatHref } from "../src/lib/ui/preferences.ts";

const context = { repository: { search: () => assert.fail("No unplanned retrieval") } };
const request = (chatMode, extra = {}) => new Request("http://localhost/api/chat", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({message:"What is photosynthesis?",chatMode,...extra}) });
const result = status => ({ content:status === "generated" ? "Evidence answer" : "Insufficient", sources:status === "generated" ? [{documentId:"owned",excerpt:"Evidence"}] : [], rag:{status,model:null,retrievedChunkCount:status === "generated" ? 1 : 0,contextChunkCount:status === "generated" ? 1 : 0,contextBytes:0} });

test("Explicit chat modes preserve grounding, bypass retrieval for General, and only Auto falls back", async t => {
  const old=process.env.LLM_MODE; process.env.LLM_MODE="local";
  try {
    for (const mode of ["documents","general","auto"]) for (const evidence of [true,false]) {
      await t.test(`${mode} / evidence=${evidence}`, async () => {
        let ragCalls=0,generalCalls=0;
        const response=await handleChatRequest(request(mode),context,async()=>{ragCalls++;return result(evidence?"generated":"insufficient_context");},async(question,provider,requestedMode)=>{generalCalls++;assert.equal(provider.mode,"local");return {content:"General answer",sources:[],rag:{...result("insufficient_context").rag,status:"general",chatMode:requestedMode}};});
        const body=await response.json();assert.equal(response.status,200);
        const general=mode==="general"||(mode==="auto"&&!evidence);
        assert.equal(ragCalls,mode==="general"?0:1);assert.equal(generalCalls,general?1:0);
        assert.equal(body.rag.status,general?"general":evidence?"generated":"insufficient_context");
        assert.equal(body.rag.chatMode,mode);assert.equal(body.sources.length,!general&&evidence?1:0);
      });
    }
    await t.test("Authentication, origin and invalid modes fail before any AI or retrieval",async()=>{
      let calls=0;const run=async()=>{calls++;assert.fail("Must not generate");};
      assert.equal((await handleChatRequest(request("general"),null,run,run)).status,401);
      assert.equal((await handleChatRequest(request("invalid"),context,run,run)).status,400);
      assert.equal((await handleChatRequest(request({}),context,run,run)).status,400);
      assert.equal((await handleChatRequest(request("general",{sources:[]}),context,run,run)).status,400);
      assert.equal(calls,0);
    });
    await t.test("Auto does not turn retrieval failure into a general answer",async()=>{
      let generalCalls=0;const response=await handleChatRequest(request("auto"),context,async()=>{throw new Error("private failure");},async()=>{generalCalls++;assert.fail("No fallback");});
      assert.equal(response.status,500);assert.equal(generalCalls,0);assert.doesNotMatch(await response.text(),/private failure/);
    });
  } finally {if(old===undefined)delete process.env.LLM_MODE;else process.env.LLM_MODE=old;}
});

test("General prompt has no document context, returns no sources and carries persistent provenance",async()=>{
  let calls=0;const provider={mode:"local",enabled:true,reply:async(question,options)=>{calls++;assert.equal(question,"What is photosynthesis?");assert.equal(options.system,GENERAL_SYSTEM_PROMPT);return "Plants convert light into chemical energy.";}};
  const reply=await answerGenerally("What is photosynthesis?",provider,"general");
  assert.equal(calls,1);assert.deepEqual(reply.sources,[]);assert.equal(reply.rag.status,"general");assert.equal(reply.rag.contextChunkCount,0);assert.equal(reply.rag.model,"qwen3:4b-instruct");
  await assert.rejects(answerGenerally("Question",{...provider,mode:"openai"},"general"),/local provider/);
  assert.equal(calls,1);
});

test("Documents is the safe UI default and document links force Documents",()=>{
  assert.equal(parseChatMode(null),"documents");assert.equal(parseChatMode("general"),"general");assert.equal(parseChatMode("auto"),"auto");assert.equal(parseChatMode("unknown"),"documents");
  assert.equal(new URL(documentChatHref("owned-id"),"http://localhost").searchParams.get("mode"),"documents");
});
