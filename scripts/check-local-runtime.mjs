import { checkLocalRuntime } from "../src/lib/ai/providers/local.ts";

try {
  const result = await checkLocalRuntime();
  console.log(JSON.stringify(result));
  if (!result.modelInstalled || !result.modelMatches) {
    console.log("The reviewed qwen3:4b-instruct model is missing or changed. Check the existing local model inventory. This command downloads nothing and sends no prompt.");
    process.exitCode = 1;
  }
} catch {
  console.log("The local Ollama/model configuration is unavailable or invalid. Check the existing localhost runtime and qwen3:4b-instruct inventory.");
  console.log("No model was downloaded, no generation ran and no external fallback was attempted.");
  process.exitCode = 1;
}
