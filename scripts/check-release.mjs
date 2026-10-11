import nextEnv from "@next/env";
import { stat } from "node:fs/promises";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { getSupabaseConfig } from "../src/lib/supabase/config.ts";
import { getLlmMode, getLlmProvider } from "../src/lib/ai/provider.ts";
import { getLocalOrigin, getLocalModelName } from "../src/lib/ai/local-config.ts";
import { checkLocalRuntime } from "../src/lib/ai/providers/local.ts";
import { EMBEDDING_LOCAL_MODEL_DIRECTORY, EMBEDDING_MODEL_FILES } from "../src/lib/embeddings/config.ts";

// Next's normal environment precedence, without printing any configuration values.
nextEnv.loadEnvConfig(process.cwd());
const checks = [];
async function check(name, action) {
  try { await action(); checks.push({ check: name, passed: true }); }
  catch { checks.push({ check: name, passed: false }); process.exitCode = 1; }
}
await check("Node 24 or later", () => { if (Number(process.versions.node.split('.')[0]) < 24) throw new Error(); });
await check("Supabase public configuration is valid", getSupabaseConfig);
await check(".env.local is ignored and untracked", () => {
  execFileSync("git", ["check-ignore", "--quiet", ".env.local"]);
  if (execFileSync("git", ["ls-files", "--", ".env.local"]).toString().trim()) throw new Error();
});
await check("Safe explicit mock/local mode; OpenAI remains disabled", () => {
  if (!["mock", "local"].includes(getLlmMode()) || !getLlmProvider().enabled) throw new Error();
  const old = process.env.LLM_MODE;
  try { process.env.LLM_MODE = "openai"; if (getLlmProvider().enabled) throw new Error(); }
  finally { if (old === undefined) delete process.env.LLM_MODE; else process.env.LLM_MODE = old; }
});
if (getLlmMode() === "local") {
  await check("Ollama uses reviewed model and loopback only", () => { getLocalOrigin(); getLocalModelName(); });
  await check("Pinned MiniLM artifacts are already available locally", async () => {
    for (const file of EMBEDDING_MODEL_FILES) {
      const entry = await stat(resolve(EMBEDDING_LOCAL_MODEL_DIRECTORY, file));
      if (!entry.isFile() || !entry.size) throw new Error();
    }
  });
  if (process.argv.includes("--runtime")) await check("Installed local Ollama inventory matches; no generation", async () => {
    const result = await checkLocalRuntime();
    if (!result.modelInstalled || !result.modelMatches) throw new Error();
  });
}
console.log(JSON.stringify({ checks, downloads: 0, generationRequests: 0, hostedInferenceRequests: 0 }, null, 2));
if (process.exitCode) console.log("Fix the failed category using README setup guidance. No environment values were printed.");
