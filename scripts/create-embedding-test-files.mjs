import { mkdir, writeFile } from "node:fs/promises";
import { createTextPdf } from "./pdf-fixtures.mjs";

// Public synthetic material only; no private document or account is read.
function page(topic) {
  return Array.from({ length: 4 }, (_, section) =>
    [
      `${topic}: section ${section + 1}.`,
      "React is a JavaScript library for building user interfaces.",
      "Components organize the interface into reusable pieces.",
      "The server turns document passages into numerical vectors.",
      "Similar passages often have similar vector directions.",
      "Each vector keeps its source chunk and physical page numbers.",
      "The local model runs on the CPU without hosted inference.",
      "No text or vector is saved to an application database.",
    ].join("\n"),
  ).join("\n\n");
}

const directory = new URL("../.setup-cache/embedding-tests/", import.meta.url);
await mkdir(directory, { recursive: true });
const name = "phase-7-embedding-test.pdf";
const bytes = createTextPdf([
  page("Page one - semantic meaning"),
  "", // Preserve the distinction between physical page 2 and pages with text.
  page("Page three - vectors and metadata"),
]);
await writeFile(new URL(name, directory), bytes);
console.log(`${name}: ${bytes.length} bytes (generated disposable fixture)`);
