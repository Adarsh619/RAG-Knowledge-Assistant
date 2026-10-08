import assert from "node:assert/strict";
import test from "node:test";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import tls from "node:tls";

// This expected source is independent of chunk boundaries. It models the
// documented normalization once, then verifies complete content coverage.
function expectedSource(pages) {
  return pages
    .map((page) => page.text.replace(/\r\n?/g, "\n").trim())
    .filter(Boolean)
    .join("\n\n");
}

function expectedPageSpans(pages) {
  const spans = [];
  let offset = 0;
  for (const page of pages) {
    const text = page.text.replace(/\r\n?/g, "\n").trim();
    if (!text) continue;
    if (spans.length) offset += 2;
    spans.push({
      pageNumber: page.pageNumber,
      start: offset,
      end: offset + text.length,
    });
    offset += text.length;
  }
  return spans;
}

function assertChunkInvariants(result, pages, documentId) {
  const source = expectedSource(pages);
  const spans = expectedPageSpans(pages);
  assert.equal(result.sourceCharacterCount, source.length);
  let reconstructed = "";
  let previous;
  for (const [index, chunk] of result.chunks.entries()) {
    assert.equal(chunk.chunkIndex, index);
    assert.equal(chunk.documentId, documentId);
    assert.equal(chunk.characterCount, chunk.text.length);
    assert.ok(chunk.text.length > 0);
    assert.ok(chunk.text.length <= result.options.maxCharacters);
    assert.equal(chunk.text, source.slice(chunk.startOffset, chunk.endOffset));
    assert.ok(chunk.startOffset >= 0);
    assert.ok(chunk.endOffset <= source.length);
    assert.equal(chunk.endOffset - chunk.startOffset, chunk.characterCount);
    assert.equal(typeof chunk.forcedWordSplit, "boolean");
    // The generated fixtures contain valid Unicode. Neither edge may cut an
    // astral code point in half, including when falling back to a hard cut.
    assert.ok(!/[\uDC00-\uDFFF]/.test(chunk.text[0]));
    assert.ok(!/[\uD800-\uDBFF]/.test(chunk.text.at(-1)));
    assert.deepEqual(
      chunk.pageNumbers,
      spans
        .filter(
          (span) =>
            span.start < chunk.endOffset && span.end > chunk.startOffset,
        )
        .map((span) => span.pageNumber),
    );
    if (previous) {
      assert.ok(
        chunk.startOffset > previous.startOffset,
        "each chunk must advance its start",
      );
      assert.ok(
        chunk.endOffset > previous.endOffset,
        "each chunk must advance its end",
      );
      assert.ok(
        chunk.startOffset <= previous.endOffset,
        "chunks must not leave a gap",
      );
      const overlap = previous.endOffset - chunk.startOffset;
      assert.equal(chunk.overlapWithPrevious, overlap);
      assert.ok(overlap >= 0 && overlap <= result.options.overlapCharacters);
      assert.equal(
        previous.text.slice(previous.text.length - overlap),
        chunk.text.slice(0, overlap),
      );
      reconstructed += chunk.text.slice(overlap);
    } else {
      assert.equal(chunk.startOffset, 0);
      assert.equal(chunk.overlapWithPrevious, 0);
      reconstructed = chunk.text;
    }
    previous = chunk;
  }
  assert.equal(
    reconstructed,
    source,
    "non-overlap text reconstructs the complete normalized source",
  );
  if (source) assert.equal(result.chunks.at(-1).endOffset, source.length);
  else assert.deepEqual(result.chunks, []);
}

test("Phase 6 deterministic chunking with no outbound network", async (t) => {
  const saved = [];
  let outboundAttempts = 0;
  function block(target, key) {
    saved.push([target, key, target[key]]);
    target[key] = () => {
      outboundAttempts++;
      throw new Error("Blocked outbound network before I/O.");
    };
  }
  block(globalThis, "fetch");
  for (const target of [http, https]) {
    block(target, "request");
    block(target, "get");
  }
  for (const target of [net, tls]) block(target, "connect");
  block(net, "createConnection");
  try {
    const { chunkDocument, DEFAULT_CHUNKING_OPTIONS } = await import(
      "../src/lib/rag/chunk-document.ts"
    );
    const documentId = "00000000-0000-4000-8000-000000000003--chunk-test.pdf";
    const page = (text, pageNumber = 1) => ({ pageNumber, text });

    await t.test(
      "development defaults are explicit and a small PDF fits one chunk",
      () => {
        assert.deepEqual(DEFAULT_CHUNKING_OPTIONS, {
          maxCharacters: 1200,
          overlapCharacters: 200,
        });
        const pages = [page("A short document provides enough context.")];
        const result = chunkDocument(documentId, pages);
        assert.deepEqual(result.options, DEFAULT_CHUNKING_OPTIONS);
        assert.equal(result.chunks.length, 1);
        assert.deepEqual(result.chunks[0].pageNumbers, [1]);
        assert.equal(result.chunks[0].forcedWordSplit, false);
        assertChunkInvariants(result, pages, documentId);
      },
    );

    await t.test(
      "normalization preserves inner whitespace while removing outer page whitespace",
      () => {
        const pages = [
          page(" \r\nFirst  paragraph.\r\n\rSecond line. \t"),
          page("\n Next page.\r\n", 2),
        ];
        const result = chunkDocument(documentId, pages);
        assert.equal(
          result.chunks[0].text,
          "First  paragraph.\n\nSecond line.\n\nNext page.",
        );
        assertChunkInvariants(result, pages, documentId);
      },
    );

    await t.test(
      "empty, whitespace-only, and image-only extraction results yield zero chunks",
      () => {
        for (const pages of [[], [page("")], [page(" \r\n\t"), page("", 2)]]) {
          const result = chunkDocument(documentId, pages);
          assert.equal(result.sourceCharacterCount, 0);
          assertChunkInvariants(result, pages, documentId);
        }
      },
    );

    await t.test(
      "page metadata keeps physical page numbers across blank pages",
      () => {
        const pages = [
          page("Text from page one."),
          page("", 2),
          page("Text from page three.", 3),
        ];
        const result = chunkDocument(documentId, pages);
        assert.deepEqual(result.chunks[0].pageNumbers, [1, 3]);
        assertChunkInvariants(result, pages, documentId);
      },
    );

    await t.test(
      "multi-page text is covered completely with correct metadata for every chunk",
      () => {
        const pages = [
          page("Page one contains contextual sentences. ".repeat(11)),
          page(
            "Page two contains additional facts and details. ".repeat(13),
            2,
          ),
          page("", 3),
          page("Page four ends with the important final detail.", 4),
        ];
        const result = chunkDocument(documentId, pages, {
          maxCharacters: 120,
          overlapCharacters: 24,
        });
        assert.ok(result.chunks.length > 5);
        assert.ok(result.chunks.some((chunk) => chunk.pageNumbers.includes(4)));
        assertChunkInvariants(result, pages, documentId);
      },
    );

    await t.test(
      "paragraph boundaries are preferred inside the natural-boundary window",
      () => {
        const firstParagraph = "First paragraph has enough words here.";
        const pages = [
          page(
            `${firstParagraph}\n\n${"Next paragraph keeps going with useful text. ".repeat(5)}`,
          ),
        ];
        const result = chunkDocument(documentId, pages, {
          maxCharacters: 60,
          overlapCharacters: 0,
        });
        assert.equal(result.chunks[0].text.trimEnd(), firstParagraph);
        assert.equal(result.chunks[0].forcedWordSplit, false);
        assertChunkInvariants(result, pages, documentId);
      },
    );

    await t.test(
      "sentence boundaries are preferred over arbitrary cuts",
      () => {
        const firstSentence =
          "A complete sentence contains useful information.";
        const pages = [
          page(
            `${firstSentence} ${"Additional words fill the remaining space without a stop ".repeat(5)}`,
          ),
        ];
        const result = chunkDocument(documentId, pages, {
          maxCharacters: 70,
          overlapCharacters: 0,
        });
        assert.equal(result.chunks[0].text.trimEnd(), firstSentence);
        assert.equal(result.chunks[0].forcedWordSplit, false);
        assertChunkInvariants(result, pages, documentId);
      },
    );

    await t.test(
      "ordinary words are not split and overlap repeats actual source content",
      () => {
        const pages = [
          page(
            "alpha bravo charlie delta echo foxtrot golf hotel india juliet ".repeat(
              9,
            ),
          ),
        ];
        const result = chunkDocument(documentId, pages, {
          maxCharacters: 72,
          overlapCharacters: 18,
        });
        assert.ok(result.chunks.some((chunk) => chunk.overlapWithPrevious > 0));
        assert.ok(result.chunks.every((chunk) => !chunk.forcedWordSplit));
        const source = expectedSource(pages);
        for (const chunk of result.chunks) {
          if (chunk.startOffset)
            assert.ok(
              /\s/.test(source[chunk.startOffset - 1]) ||
                /\s/.test(source[chunk.startOffset]),
            );
          if (chunk.endOffset < source.length)
            assert.ok(
              /\s/.test(source[chunk.endOffset - 1]) ||
                /\s/.test(source[chunk.endOffset]),
            );
        }
        assertChunkInvariants(result, pages, documentId);
      },
    );

    await t.test(
      "zero overlap still covers every character without duplicate source spans",
      () => {
        const pages = [
          page("This passage preserves every word and all spacing. ".repeat(9)),
        ];
        const result = chunkDocument(documentId, pages, {
          maxCharacters: 75,
          overlapCharacters: 0,
        });
        assert.ok(result.chunks.length > 1);
        assert.ok(
          result.chunks.every((chunk) => chunk.overlapWithPrevious === 0),
        );
        assertChunkInvariants(result, pages, documentId);
      },
    );

    await t.test(
      "long unbroken tokens use documented forced cuts within the configured limit",
      () => {
        const pages = [page("X".repeat(253))];
        const result = chunkDocument(documentId, pages, {
          maxCharacters: 40,
          overlapCharacters: 10,
        });
        assert.ok(result.chunks.length > 1);
        assert.ok(result.chunks.some((chunk) => chunk.forcedWordSplit));
        assertChunkInvariants(result, pages, documentId);
      },
    );

    await t.test(
      "a token that fits the maximum remains intact after a short prefix",
      () => {
        const token = "x".repeat(1100);
        const pages = [page("intro ".repeat(50) + token)];
        for (const overlapCharacters of [0, 200]) {
          const result = chunkDocument(documentId, pages, {
            maxCharacters: 1200,
            overlapCharacters,
          });
          assert.ok(result.chunks.every((chunk) => !chunk.forcedWordSplit));
          assert.ok(result.chunks.some((chunk) => chunk.text.includes(token)));
          assertChunkInvariants(result, pages, documentId);
        }
      },
    );

    await t.test(
      "hard cuts never split emoji surrogate pairs, including the minimum chunk size",
      () => {
        for (const pages of [
          [page("😀🙂🚀".repeat(17))],
          [page("a  😀")],
          [page("alpha 🙂 beta 🚀 gamma 😀 delta ".repeat(5))],
        ]) {
          for (const options of [
            { maxCharacters: 9, overlapCharacters: 3 },
            { maxCharacters: 2, overlapCharacters: 1 },
          ]) {
            const result = chunkDocument(documentId, pages, options);
            assertChunkInvariants(result, pages, documentId);
          }
        }
      },
    );

    await t.test(
      "high overlap still makes progress and preserves the final short tail",
      () => {
        const pages = [
          page("one two three four five six seven eight nine ten end"),
        ];
        const result = chunkDocument(documentId, pages, {
          maxCharacters: 20,
          overlapCharacters: 19,
        });
        assert.ok(result.chunks.length <= expectedSource(pages).length);
        assert.ok(result.chunks.at(-1).text.endsWith("end"));
        assertChunkInvariants(result, pages, documentId);
      },
    );

    await t.test(
      "separator boundaries cannot drop page text or produce false page metadata",
      () => {
        for (const pages of [
          [page("alpha"), page("beta", 4), page("gamma", 9), page("omega", 10)],
          [page("aa"), page("bb", 2)],
        ]) {
          for (const maxCharacters of [2, 3, 7, 12, 16]) {
            const result = chunkDocument(documentId, pages, {
              maxCharacters,
              overlapCharacters: 0,
            });
            assertChunkInvariants(result, pages, documentId);
          }
        }
      },
    );

    await t.test(
      "varied Unicode and whitespace fixtures satisfy invariants across configurable limits",
      () => {
        // Deterministic combinations exercise tiny windows, punctuation, paragraph
        // separators, and overlap without depending on a random generator.
        const texts = [
          "a  😀 b \n\n c 🚀 d",
          "😀 alpha.\n\n🙂 beta! gamma? delta.",
          "one\t\ttwo three    four five",
          "q".repeat(37) + " 😀 " + "r".repeat(29),
          "first line\nnext line\n\nlast paragraph",
        ];
        for (const text of texts) {
          const pages = [
            page(text),
            page("", 2),
            page("Tail with 🙂 and final words.", 3),
          ];
          for (const maxCharacters of [2, 3, 4, 5, 7, 11, 19, 31]) {
            for (const overlapCharacters of new Set([
              0,
              1,
              Math.floor(maxCharacters / 3),
              maxCharacters - 1,
            ])) {
              const result = chunkDocument(documentId, pages, {
                maxCharacters,
                overlapCharacters,
              });
              assertChunkInvariants(result, pages, documentId);
            }
          }
        }
      },
    );

    await t.test(
      "output is deterministic and caller inputs and defaults remain unchanged",
      () => {
        const pages = [
          page("A deterministic paragraph. ".repeat(40)),
          page("Another page.", 2),
        ];
        const options = { maxCharacters: 91, overlapCharacters: 16 };
        const beforePages = structuredClone(pages);
        const beforeOptions = structuredClone(options);
        const defaults = structuredClone(DEFAULT_CHUNKING_OPTIONS);
        const first = chunkDocument(documentId, pages, options);
        assert.deepEqual(chunkDocument(documentId, pages, options), first);
        assert.deepEqual(pages, beforePages);
        assert.deepEqual(options, beforeOptions);
        assert.deepEqual(DEFAULT_CHUNKING_OPTIONS, defaults);
        assertChunkInvariants(first, pages, documentId);
      },
    );

    await t.test("invalid chunk size and overlap settings are rejected", () => {
      const pages = [page("Some text")];
      for (const maxCharacters of [0, 1, -2, 2.5, NaN, Infinity, -Infinity])
        assert.throws(() =>
          chunkDocument(documentId, pages, { maxCharacters }),
        );
      for (const overlapCharacters of [
        -1,
        1.5,
        NaN,
        Infinity,
        -Infinity,
        20,
        21,
      ])
        assert.throws(() =>
          chunkDocument(documentId, pages, {
            maxCharacters: 20,
            overlapCharacters,
          }),
        );
    });

    await t.test(
      "document identifiers remain distinct for otherwise identical content",
      () => {
        const pages = [
          page("The same source can belong to separate documents."),
        ];
        const secondId =
          "00000000-0000-4000-8000-000000000004--second-document.pdf";
        const first = chunkDocument(documentId, pages);
        const second = chunkDocument(secondId, pages);
        assert.equal(first.chunks[0].text, second.chunks[0].text);
        assert.equal(second.chunks[0].documentId, secondId);
        assertChunkInvariants(second, pages, secondId);
      },
    );

    await t.test(
      "chunking made zero external, embedding, or LLM network attempts",
      () => {
        assert.equal(outboundAttempts, 0);
      },
    );
  } finally {
    for (const [target, key, value] of saved) target[key] = value;
  }
});
