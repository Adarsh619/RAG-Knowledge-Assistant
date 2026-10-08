import { mkdir, writeFile } from "node:fs/promises";
import { createTextPdf } from "./pdf-fixtures.mjs";
import { CHUNKING_TEST_PAGES } from "./chunking-fixtures.mjs";

const directory = new URL("../.setup-cache/chunking-tests/", import.meta.url);
await mkdir(directory, { recursive: true });
for (const [name, bytes] of [
  [
    "phase-6-small.pdf",
    createTextPdf(["A small document keeps its text in one readable chunk."]),
  ],
  ["phase-6-multi-page.pdf", createTextPdf(CHUNKING_TEST_PAGES)],
  ["phase-6-image-only.pdf", createTextPdf([null])],
]) {
  await writeFile(new URL(name, directory), bytes);
  console.log(`${name}: ${bytes.length} bytes (generated disposable fixture)`);
}
