"use client";

import { useState } from "react";
import type { ExtractionResponse } from "@/types/extraction";

export function ChunkPreview({ result }: { result: ExtractionResponse }) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const { chunking, extraction } = result;
  const chunk = chunking.chunks[selectedIndex] ?? chunking.chunks[0];

  return (
    <section className="panel mt-7 p-6" aria-labelledby="chunk-heading">
      <h2 id="chunk-heading" className="font-semibold">
        Chunk inspector
      </h2>
      <p className="mt-2 text-xs leading-5 text-slate-500">
        {extraction.characterCount.toLocaleString()} extracted characters ·{" "}
        {chunking.chunks.length} chunks · Maximum{" "}
        {chunking.options.maxCharacters.toLocaleString()} characters · Up to{" "}
        {chunking.options.overlapCharacters} characters of overlap
      </p>
      {!chunk ? (
        <p role="status" className="mt-4 text-sm leading-6 text-slate-500">
          No chunks were created because this PDF has no extractable text.
        </p>
      ) : (
        <>
          <label
            htmlFor="chunk-selection"
            className="mt-5 block text-sm font-medium"
          >
            Inspect a chunk
          </label>
          <select
            id="chunk-selection"
            value={chunk.chunkIndex}
            onChange={(event) => setSelectedIndex(Number(event.target.value))}
            className="mt-2 w-full rounded-xl border border-slate-200 bg-white p-3 text-sm sm:max-w-md"
          >
            {chunking.chunks.map((item) => (
              <option key={item.chunkIndex} value={item.chunkIndex}>
                Chunk {item.chunkIndex} · Pages{" "}
                {item.pageNumbers.join(", ") || "separator only"} ·{" "}
                {item.characterCount} characters
              </option>
            ))}
          </select>
          <dl className="mt-4 grid grid-cols-2 gap-4 text-xs sm:grid-cols-4">
            <div>
              <dt className="text-slate-500">Source pages</dt>
              <dd className="mt-1 font-semibold">
                {chunk.pageNumbers.join(", ") || "Page separator only"}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">Characters</dt>
              <dd className="mt-1 font-semibold">{chunk.characterCount}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Overlap with previous</dt>
              <dd className="mt-1 font-semibold">
                {chunk.overlapWithPrevious}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">Source offsets</dt>
              <dd className="mt-1 font-semibold">
                {chunk.startOffset}–{chunk.endOffset} (end excluded)
              </dd>
            </div>
          </dl>
          <pre className="mt-4 max-h-80 overflow-y-auto whitespace-pre-wrap break-words rounded-xl bg-slate-50 p-4 font-sans text-sm leading-6 text-slate-700">
            {chunk.text}
          </pre>
          {chunk.forcedWordSplit && (
            <p className="mt-3 text-xs leading-5 text-amber-800">
              A long unbroken token needed a hard cut to keep the chunk within
              its size limit.
            </p>
          )}
          <p className="mt-4 text-xs leading-5 text-slate-500">
            The normalized source contains{" "}
            {chunking.sourceCharacterCount.toLocaleString()} characters,
            including two newline characters between pages with text. Page
            numbers refer to physical PDF pages; blank pages are not credited to
            chunks. Counts use JavaScript string length, not model tokens.
          </p>
        </>
      )}
      <p className="mt-4 text-xs leading-5 text-slate-400">
        Split locally on the server. Chunks exist only for this preview and
        clear with the text preview. Nothing is saved to a database.
      </p>
    </section>
  );
}
