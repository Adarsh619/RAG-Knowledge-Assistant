import { mkdir, stat, writeFile, rename } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  EMBEDDING_MODEL,
  EMBEDDING_LOCAL_MODEL_DIRECTORY,
  EMBEDDING_MODEL_FILES,
} from "../src/lib/embeddings/config.ts";

// This is the only model-download step. Allow public artifact reads from the
// pinned repository, without any Hub token or document text/content.
let artifactRequests = 0;
for (const file of EMBEDDING_MODEL_FILES) {
  const target = resolve(EMBEDDING_LOCAL_MODEL_DIRECTORY, file);
  const existing = await stat(target).catch(() => null);
  if (!existing?.isFile() || !existing.size) {
    // Fixed public GET URLs only: no key, body, document, or inference endpoint.
    const url = `https://huggingface.co/${EMBEDDING_MODEL.id}/resolve/${EMBEDDING_MODEL.revision}/${file}`;
    const response = await fetch(url, { signal: AbortSignal.timeout(120_000) });
    if (!response.ok)
      throw new Error(
        `Public artifact download failed for ${file}: HTTP ${response.status}`,
      );
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (!bytes.length) throw new Error(`Public artifact ${file} was empty.`);
    await mkdir(dirname(target), { recursive: true });
    const temporary = `${target}.download-${process.pid}`;
    await writeFile(temporary, bytes);
    await rename(temporary, target); // Expose only a completed local artifact.
    artifactRequests++;
  }
  console.log(`Prepared public artifact: ${file}`);
}
console.log(
  JSON.stringify({
    model: EMBEDDING_MODEL.id,
    revision: EMBEDDING_MODEL.revision,
    prepared: true,
    publicArtifactRequests: artifactRequests,
    inferenceRequests: 0,
  }),
);
