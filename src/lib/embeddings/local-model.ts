import "server-only";
import {
  EMBEDDING_CACHE_DIRECTORY,
  EMBEDDING_LOCAL_MODEL_DIRECTORY,
  EMBEDDING_MODEL,
  EMBEDDING_MODEL_FILES,
} from "./config.ts";
import { stat } from "node:fs/promises";
import { resolve } from "node:path";

// A small contract also lets offline tests provide controlled model outputs.
// The production implementation below always uses the real local model.
export interface LocalEmbeddingPipeline {
  (
    texts: string[],
    options: { pooling: "mean"; normalize: true },
  ): Promise<{
    dims: number[];
    data: ArrayLike<number>;
  }>;
  countTokens(text: string): number;
}

export async function loadLocalEmbeddingModel(): Promise<LocalEmbeddingPipeline> {
  for (const file of EMBEDDING_MODEL_FILES) {
    const info = await stat(resolve(EMBEDDING_LOCAL_MODEL_DIRECTORY, file));
    if (!info.isFile() || !info.size)
      throw new Error("Prepare all required model artifacts first.");
  }
  // Dynamic import keeps native inference out of the browser and avoids
  // loading model/runtime resources during extraction or the production build.
  const { AutoModel, AutoTokenizer, FeatureExtractionPipeline, env } =
    await import("@huggingface/transformers");
  env.cacheDir = EMBEDDING_CACHE_DIRECTORY;
  env.allowLocalModels = true;
  env.allowRemoteModels = false;
  env.useFSCache = true;
  env.useBrowserCache = false;
  const options = {
    revision: EMBEDDING_MODEL.revision,
    dtype: EMBEDDING_MODEL.dtype,
    device: EMBEDDING_MODEL.device,
    local_files_only: true,
    session_options: { intraOpNumThreads: 2, interOpNumThreads: 1 },
  };
  // Transformers.js 4.3.1's convenience pipeline() performs remote registry
  // metadata discovery without forwarding local_files_only/revision. Build
  // its official feature pipeline directly so startup stays fully offline.
  // An explicit local revision folder also avoids tokenizer registry discovery
  // defaulting to the Hub's main revision instead of the requested commit.
  const tokenizer = await AutoTokenizer.from_pretrained(
    EMBEDDING_LOCAL_MODEL_DIRECTORY,
    options,
  );
  const model = await AutoModel.from_pretrained(
    EMBEDDING_LOCAL_MODEL_DIRECTORY,
    options,
  );
  const extractor = new FeatureExtractionPipeline({
    task: "feature-extraction",
    model,
    tokenizer,
  });
  if (extractor.tokenizer.model_max_length !== EMBEDDING_MODEL.maxInputTokens) {
    await extractor.dispose();
    throw new Error("Unexpected local tokenizer capacity.");
  }
  return Object.assign(
    async (texts: string[], options: { pooling: "mean"; normalize: true }) => {
      const output = await extractor(texts, options);
      if (!(output.data instanceof Float32Array))
        throw new Error("Expected floating-point sentence embeddings.");
      return { dims: output.dims, data: output.data };
    },
    {
      countTokens(text: string) {
        // The pipeline normally truncates automatically. Check first, including
        // special tokens, so no chunk is silently represented by only its prefix.
        return extractor.tokenizer(text, {
          truncation: false,
          padding: false,
          return_tensor: false,
        }).input_ids.length;
      },
    },
  );
}
