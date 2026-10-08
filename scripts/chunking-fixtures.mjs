// Public synthetic content shared by real-parser tests and disposable live PDFs.
function page(topic) {
  return Array.from({ length: 4 }, (_, section) =>
    [
      `${topic}: section ${section + 1}.`,
      "A document is split into smaller passages for later retrieval.",
      "Each passage keeps the physical pages that supplied its text.",
      "An overlap repeats a little context from the previous passage.",
      "Paragraph and sentence boundaries make the passages readable.",
      "The server downloads only the signed-in user's private file.",
      "No vectors are created and no text is saved to a database.",
      "All processing here runs locally without an external AI call.",
    ].join("\n"),
  ).join("\n\n");
}

export const CHUNKING_TEST_PAGES = [
  page("Page one - chunk size and context"),
  "", // A physical blank page must never be credited to a chunk.
  page("Page three - source metadata and overlap"),
];
