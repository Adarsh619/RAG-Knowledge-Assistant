import type { ExtractionResponse } from "@/types/extraction";

export function ExtractionPreview({
  result,
  onClose,
}: {
  result: ExtractionResponse;
  onClose: () => void;
}) {
  const { extraction, document } = result;
  const previewPages = extraction.pages.filter((page) => page.text).slice(0, 3);
  return (
    <section className="panel mt-7 p-6" aria-labelledby="extraction-heading">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 id="extraction-heading" className="break-words font-semibold">
            Text preview · {document.name}
          </h2>
          <p className="mt-2 text-xs leading-5 text-slate-500">
            {extraction.pageCount} pages ·{" "}
            {extraction.characterCount.toLocaleString()} characters ·{" "}
            {extraction.emptyPageCount} pages without text
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 text-xs font-semibold text-emerald-800"
        >
          Close preview
        </button>
      </div>
      {extraction.status === "no_text" ? (
        <p
          role="status"
          className="mt-4 rounded-xl bg-amber-50 p-4 text-sm leading-6 text-amber-900"
        >
          No extractable text was found. This PDF may contain scanned pages or
          images. OCR is not included in this phase.
        </p>
      ) : (
        <>
          <p className="mt-4 text-xs leading-5 text-slate-500">
            Showing up to 3 pages with text, with 1,500 characters per page. The
            server retains page numbers in the extraction result. Text order and
            spacing may differ from the PDF layout.
          </p>
          <div className="mt-4 max-h-96 space-y-5 overflow-y-auto rounded-xl bg-slate-50 p-4">
            {previewPages.map((page) => (
              <div key={page.pageNumber}>
                <h3 className="text-xs font-semibold text-emerald-800">
                  Page {page.pageNumber}
                </h3>
                <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-slate-700">
                  {page.text.slice(0, 1500)}
                  {page.text.length > 1500 ? "\n… Preview shortened" : ""}
                </p>
              </div>
            ))}
          </div>
        </>
      )}
      <p className="mt-4 text-xs leading-5 text-slate-400">
        Extracted locally on the server. Nothing is saved to a database; this
        preview clears on refresh.
      </p>
    </section>
  );
}
