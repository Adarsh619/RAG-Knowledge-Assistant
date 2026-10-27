import { createWriteStream } from "node:fs";
import { mkdir, stat, rename, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import {
  EMBEDDING_MODEL,
  EMBEDDING_LOCAL_MODEL_DIRECTORY,
  EMBEDDING_MODEL_FILES,
} from "../src/lib/embeddings/config.ts";
import { EMBEDDED_MODEL_FILES, getEmbeddedModel } from "../src/lib/ai/local-config.ts";

// This is the only model-download step. Allow public artifact reads from the
// pinned repositories, without any Hub token or document text/content.
// --embeddings-only skips the generative model (LOCAL_MODEL_ID selects it).
let artifactRequests = 0;

async function prepare(model, directory, files) {
  for (const file of files) {
    const target = resolve(directory, file);
    const existing = await stat(target).catch(() => null);
    if (!existing?.isFile() || !existing.size) {
      // Fixed public GET URLs only: no key, body, document, or inference endpoint.
      const url = `https://huggingface.co/${model.id}/resolve/${model.revision}/${file}`;
      const response = await fetch(url, { signal: AbortSignal.timeout(30 * 60_000) });
      if (!response.ok || !response.body)
        throw new Error(`Public artifact download failed for ${file}: HTTP ${response.status}`);
      await mkdir(dirname(target), { recursive: true });
      const temporary = `${target}.download-${process.pid}`;
      try {
        // Stream to disk: generative weights are too large to buffer in memory.
        await pipeline(Readable.fromWeb(response.body), createWriteStream(temporary));
        if (!(await stat(temporary)).size) throw new Error(`Public artifact ${file} was empty.`);
        await rename(temporary, target); // Expose only a completed local artifact.
      } catch (cause) {
        await rm(temporary, { force: true });
        throw cause;
      }
      artifactRequests++;
    }
    console.log(`Prepared public artifact: ${model.id}/${file}`);
  }
  return { model: model.id, revision: model.revision };
}

const prepared = [
  await prepare(EMBEDDING_MODEL, EMBEDDING_LOCAL_MODEL_DIRECTORY, EMBEDDING_MODEL_FILES),
];
if (!process.argv.includes("--embeddings-only")) {
  const generative = getEmbeddedModel();
  prepared.push(await prepare(generative, generative.directory, EMBEDDED_MODEL_FILES));
}
console.log(
  JSON.stringify({
    prepared,
    publicArtifactRequests: artifactRequests,
    inferenceRequests: 0,
  }),
);
