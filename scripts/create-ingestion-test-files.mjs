import { mkdir, writeFile } from "node:fs/promises";
import { createTextPdf } from "./pdf-fixtures.mjs";
function page(topic) {
  return Array.from({ length: 4 }, (_, i) =>
    [
      `${topic}: section ${i + 1}.`,
      "React is a JavaScript library for building user interfaces.",
      "Components organize the interface into reusable pieces.",
      "The server turns document passages into numerical vectors.",
      "Similar passages often have similar vector directions.",
      "Each vector keeps its source chunk and physical page numbers.",
      "The local model runs on the CPU without hosted inference.",
      "PostgreSQL stores the passages and vectors with owner policies.",
    ].join("\n"),
  ).join("\n\n");
}
const directory = new URL("../.setup-cache/ingestion-tests/", import.meta.url);
await mkdir(directory, { recursive: true });
const name = "phase-8-ingestion-test.pdf";
const bytes = createTextPdf([
  page("Page one - persistent passages"),
  "",
  page("Page three - metadata and ownership"),
]);
await writeFile(new URL(name, directory), bytes);
console.log(`${name}: ${bytes.length} bytes (generated disposable fixture)`);
