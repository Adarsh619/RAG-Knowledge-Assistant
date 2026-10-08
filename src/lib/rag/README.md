# Phase 6: manual document chunking

`chunk-document.ts` is a server-only, deterministic utility. It takes the stored document ID and the extractor's `{ pageNumber, text }` array. It performs no download, database operation, model call, or persistence. The authenticated extraction handler invokes it after parsing; the existing owner-only Storage flow remains the access boundary.

Defaults are exported as `DEFAULT_CHUNKING_OPTIONS`: **1,200 maximum characters and up to 200 overlap characters**. `chunkDocument(id, pages, { maxCharacters, overlapCharacters })` allows server-side configuration without changing the algorithm. Size must be an integer of at least 2, and overlap must be an integer between 0 and size minus 1. Counts and offsets use JavaScript UTF-16 string length, not model tokens. Choose token-aware limits deliberately when an embedding model is added in a later phase.

The algorithm:

1. Normalize CRLF/CR to LF, trim the outside of each page, skip empty pages, and join nonempty pages with two newline characters. Record the span belonging to each physical page.
2. Read at most the maximum size. Prefer the last paragraph boundary in the latter 40% of that window, then a sentence-ending punctuation/whitespace boundary, then whitespace. These are readable heuristics, not linguistic sentence detection.
3. If no preferred boundary exists, use an earlier whitespace boundary rather than split a word that fits. A token longer than the size limit requires a hard cut; `forcedWordSplit` records this. Never cut between the two UTF-16 units of a surrogate pair.
4. Start the next window at a whitespace boundary at or after `end - overlap`. Actual overlap can be smaller than the target, including zero. Reduce it if retaining it would prevent new text from fitting or unnecessarily split a fitting word.
5. Preserve exact slices of the normalized source, including whitespace. Every chunk extends coverage beyond the previous end. Stop when the source is covered.

Each chunk has a zero-based `chunkIndex`, `documentId`, `text`, `characterCount`, `pageNumbers`, half-open `startOffset`/`endOffset`, `overlapWithPrevious`, and `forcedWordSplit`. Source pages are computed from intersecting page spans, not guessed from the first/last page. A chunk crossing text on pages 1 and 3 has `[1, 3]`; a blank page 2 is not credited. This prepares later citations without implementing them now.

`sourceCharacterCount` includes inserted page separators, so it may exceed the extraction's sum of page character counts. Reconstruct the normalized source by appending each chunk's text after removing its recorded overlap. Individual chunks are not trimmed, which keeps offsets and coverage exact. Normalization deliberately removes surrounding whitespace on each page; coverage claims apply to the normalized source.

The maximum is strict even for long tokens. Tiny diagnostic sizes such as 2 may produce a separator-only chunk with `pageNumbers: []`; it has no actual page text and remains represented to preserve exact coverage. The inspector labels this honestly. Such sizes are useful for tests, not a retrieval recommendation.

Empty/image-only extraction produces zero chunks. No OCR is attempted. Results live only for the request and in the Documents page's React state, clearing with the text preview. No application table, embedding, vector, retrieval, RAG prompt, framework, or conversation persistence is introduced.

Run `npm run test:chunking` for boundary/coverage/configuration/Unicode tests and `npm run test:pdf` for the real parser through the authenticated offline SDK flow. Both assert zero outbound network attempts. `npm run test:chunking:fixtures` creates disposable small, three-page-with-a-blank-page, and image-only PDFs in the ignored `.setup-cache/chunking-tests/` directory.
