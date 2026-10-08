import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createPdfBytes } from "./storage-fixtures.mjs";
import { MAX_PDF_BYTES } from "../src/lib/storage/documents.ts";

const directory = resolve(".setup-cache", "storage-tests");
await mkdir(directory, { recursive: true });
await writeFile(
  resolve(directory, "phase-4-storage-test.pdf"),
  createPdfBytes(),
);
await writeFile(
  resolve(directory, "unsupported.txt"),
  "This is a disposable non-PDF upload test.\n",
);
const oversized = Buffer.alloc(MAX_PDF_BYTES + 1, 32);
oversized.write("%PDF-1.4\n");
await writeFile(resolve(directory, "oversized.pdf"), oversized);
await writeFile(
  resolve(directory, "disguised.pdf"),
  "This file has a PDF name but no PDF header.\n",
);
console.log(
  "Created disposable fixtures in .setup-cache/storage-tests (ignored by Git).",
);
