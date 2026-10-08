import { mkdir, writeFile } from "node:fs/promises";
import { createTextPdf, corruptPdf } from "./pdf-fixtures.mjs";

const directory = new URL("../.setup-cache/extraction-tests/", import.meta.url);
await mkdir(directory, { recursive: true });
for (const [name, bytes] of [
  ["phase-5-text-test.pdf", createTextPdf()],
  ["phase-5-image-only.pdf", createTextPdf([null])],
  ["phase-5-corrupted.pdf", corruptPdf],
  ["phase-5-little-text.pdf", createTextPdf(["OK"])],
]) {
  await writeFile(new URL(name, directory), bytes);
  console.log(`${name}: ${bytes.length} bytes (generated disposable fixture)`);
}
