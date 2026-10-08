import "server-only";
import type { ExtractedPage } from "../../types/extraction.ts";
import type { ChunkingOptions, ChunkingResult } from "../../types/chunk.ts";

export const DEFAULT_CHUNKING_OPTIONS: Readonly<ChunkingOptions> =
  Object.freeze({
    maxCharacters: 1200,
    overlapCharacters: 200,
  });

// Search the latter part of the window to avoid many tiny chunks.
const MIN_BOUNDARY_FRACTION = 0.6;
const whitespace = (character: string | undefined) =>
  character !== undefined && /\s/u.test(character);

function isSafeUnicodeBoundary(text: string, offset: number) {
  const before = text.charCodeAt(offset - 1);
  const after = text.charCodeAt(offset);
  return !(
    before >= 0xd800 &&
    before <= 0xdbff &&
    after >= 0xdc00 &&
    after <= 0xdfff
  );
}

function splitsWord(text: string, offset: number) {
  return (
    offset > 0 &&
    offset < text.length &&
    !whitespace(text[offset - 1]) &&
    !whitespace(text[offset])
  );
}

function chooseEnd(
  text: string,
  start: number,
  previousEnd: number,
  maxCharacters: number,
) {
  let limit = Math.min(start + maxCharacters, text.length);
  if (!isSafeUnicodeBoundary(text, limit)) limit--;
  if (limit === text.length) return limit;
  const minimum = Math.max(
    start + Math.ceil(maxCharacters * MIN_BOUNDARY_FRACTION),
    previousEnd + 1,
  );
  const window = text.slice(start, limit);
  let earlierBoundary = 0;
  // A boundary includes its separator, keeping all source whitespace intact.
  for (const pattern of [/\n[\t ]*\n+/gu, /[.!?]["')\]]?\s+/gu, /\s+/gu]) {
    let best = 0;
    for (const match of window.matchAll(pattern)) {
      const end = start + match.index + match[0].length;
      if (end >= minimum) best = end;
      if (end > previousEnd) earlierBoundary = Math.max(earlierBoundary, end);
    }
    if (best) return best;
  }
  // Keep a fitting word whole even when its preceding boundary is earlier
  // than our preferred window. Avoiding a word cut outweighs a fuller chunk.
  if (earlierBoundary) return earlierBoundary;
  return limit; // Unbroken token: a strict-size hard cut is unavoidable.
}

function chooseNextStart(
  text: string,
  start: number,
  end: number,
  overlap: number,
) {
  if (!overlap) return end;
  const desired = Math.max(start + 1, end - overlap);
  for (let candidate = desired; candidate < end; candidate++) {
    if (
      isSafeUnicodeBoundary(text, candidate) &&
      (whitespace(text[candidate - 1]) || whitespace(text[candidate]))
    )
      return candidate;
  }
  // Do not split a word merely to manufacture overlap. End remains covered.
  return end;
}

export function chunkDocument(
  documentId: string,
  pages: ExtractedPage[],
  overrides: Partial<ChunkingOptions> = {},
): ChunkingResult {
  const options = { ...DEFAULT_CHUNKING_OPTIONS, ...overrides };
  if (
    !Number.isSafeInteger(options.maxCharacters) ||
    options.maxCharacters < 2 ||
    !Number.isSafeInteger(options.overlapCharacters) ||
    options.overlapCharacters < 0 ||
    options.overlapCharacters >= options.maxCharacters
  ) {
    throw new Error(
      "Chunk size must be an integer of at least 2; overlap must be an integer from 0 to size minus 1.",
    );
  }
  let text = "";
  const spans: { pageNumber: number; start: number; end: number }[] = [];
  for (const page of pages) {
    const pageText = page.text.replace(/\r\n?/g, "\n").trim();
    if (!pageText) continue;
    if (text) text += "\n\n";
    const start = text.length;
    text += pageText;
    spans.push({ pageNumber: page.pageNumber, start, end: text.length });
  }
  const chunks: ChunkingResult["chunks"] = [];
  let start = 0;
  let previousEnd = 0;
  while (start < text.length) {
    let end = chooseEnd(text, start, previousEnd, options.maxCharacters);
    // With tiny sizes, retaining overlap plus a full Unicode character may
    // leave no room for new text. Drop overlap rather than repeat a window.
    if (end <= previousEnd) {
      start = previousEnd;
      end = chooseEnd(text, start, previousEnd, options.maxCharacters);
    }
    if (start < previousEnd && splitsWord(text, end)) {
      const withoutOverlap = chooseEnd(
        text,
        previousEnd,
        previousEnd,
        options.maxCharacters,
      );
      if (!splitsWord(text, withoutOverlap)) {
        start = previousEnd;
        end = withoutOverlap;
      }
    }
    const chunkText = text.slice(start, end);
    chunks.push({
      chunkIndex: chunks.length,
      documentId,
      text: chunkText,
      characterCount: chunkText.length,
      pageNumbers: [
        ...new Set(
          spans
            .filter((span) => span.start < end && span.end > start)
            .map((span) => span.pageNumber),
        ),
      ],
      startOffset: start,
      endOffset: end,
      overlapWithPrevious: chunks.length ? Math.max(0, previousEnd - start) : 0,
      forcedWordSplit: splitsWord(text, start) || splitsWord(text, end),
    });
    if (end === text.length) break;
    previousEnd = end;
    start = chooseNextStart(text, start, end, options.overlapCharacters);
  }
  return { options, sourceCharacterCount: text.length, chunks };
}
