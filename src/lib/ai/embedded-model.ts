import "server-only";
import { stat } from "node:fs/promises";
import { availableParallelism } from "node:os";
import { resolve } from "node:path";
import {
  EMBEDDED_CACHE_DIRECTORY, EMBEDDED_MODEL_FILES, getEmbeddedModel,
} from "./local-config.ts";

export interface EmbeddedChatMessage {
  role: "system" | "user";
  content: string;
}

// A small contract lets offline tests supply controlled generations.
// The production implementation below always uses the prepared local weights.
export interface EmbeddedGenerator {
  generate(
    messages: EmbeddedChatMessage[],
    options: { maxNewTokens: number; signal: AbortSignal; onText?: (text: string) => void },
  ): Promise<{ text: string; finished: boolean }>;
}

export async function hasEmbeddedModelFiles(directory = getEmbeddedModel().directory) {
  for (const file of EMBEDDED_MODEL_FILES) {
    const info = await stat(resolve(directory, file)).catch(() => null);
    if (!info?.isFile() || !info.size) return false;
  }
  return true;
}

export async function loadEmbeddedGenerator(): Promise<EmbeddedGenerator> {
  const selected = getEmbeddedModel();
  if (!(await hasEmbeddedModelFiles(selected.directory)))
    throw new Error("Prepare all required model artifacts first.");
  // Dynamic import keeps native inference out of the browser and the build.
  const {
    AutoModelForCausalLM, AutoTokenizer, InterruptableStoppingCriteria, TextStreamer, env,
  } = await import("@huggingface/transformers");
  env.cacheDir = EMBEDDED_CACHE_DIRECTORY;
  env.allowLocalModels = true;
  env.allowRemoteModels = false;
  env.useFSCache = true;
  env.useBrowserCache = false;
  const options = {
    revision: selected.revision,
    dtype: selected.dtype,
    device: "cpu" as const,
    local_files_only: true,
    session_options: { intraOpNumThreads: Math.min(4, availableParallelism()), interOpNumThreads: 1 },
  };
  // Explicit revision folder, as for MiniLM, so loading never consults the Hub.
  const tokenizer = await AutoTokenizer.from_pretrained(selected.directory, options);
  const model = await AutoModelForCausalLM.from_pretrained(selected.directory, options);

  return {
    async generate(messages, { maxNewTokens, signal, onText }) {
      signal.throwIfAborted();
      // enable_thinking=false makes Qwen3's template close the reasoning block up front.
      const inputs = tokenizer.apply_chat_template(messages, {
        add_generation_prompt: true, return_dict: true, enable_thinking: false,
      } as Parameters<typeof tokenizer.apply_chat_template>[1]);
      const stopper = new InterruptableStoppingCriteria();
      const interrupt = () => stopper.interrupt();
      signal.addEventListener("abort", interrupt, { once: true });
      let text = "";
      let tokenCount = 0;
      const streamer = new TextStreamer(tokenizer, {
        skip_prompt: true,
        skip_special_tokens: true,
        callback_function: (piece: string) => { text += piece; onText?.(piece); },
        token_callback_function: (tokens: bigint[]) => { tokenCount += tokens.length; },
      });
      try {
        await model.generate({
          ...(inputs as Record<string, unknown>),
          max_new_tokens: maxNewTokens,
          do_sample: false,
          streamer,
          stopping_criteria: stopper,
        });
      } finally {
        signal.removeEventListener("abort", interrupt);
      }
      // Reaching the token limit means the end-of-sequence token never arrived.
      return { text, finished: !signal.aborted && tokenCount < maxNewTokens };
    },
  };
}
