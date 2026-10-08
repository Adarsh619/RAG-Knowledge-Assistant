import "server-only";
// The installed worker is embedded locally; no CDN or remote parser is used.
import { getData } from "pdf-parse/worker";
import { PDFParse } from "pdf-parse";
import type { PdfExtraction } from "../../types/extraction.ts";
import { MAX_PDF_BYTES } from "../storage/documents.ts";

PDFParse.setWorker(getData());

export const MAX_EXTRACTION_PAGES = 100;
export const MAX_EXTRACTED_CHARACTERS = 200_000;

export class PdfExtractionError extends Error {
  status: number;
  constructor(message: string, status = 422) {
    super(message);
    this.status = status;
  }
}

export async function extractPdfText(
  bytes: Uint8Array,
): Promise<PdfExtraction> {
  if (!bytes.byteLength || bytes.byteLength > MAX_PDF_BYTES) {
    throw new PdfExtractionError(
      "Choose a nonempty PDF no larger than 4 MiB.",
      413,
    );
  }
  let parser: PDFParse | undefined;
  try {
    parser = new PDFParse({
      // Copy into an ordinary typed array, avoiding Node Buffer transfer issues.
      data: Uint8Array.from(bytes),
      isEvalSupported: false,
      useWorkerFetch: false,
      useWasm: false,
      disableFontFace: true,
      stopAtErrors: true,
      verbosity: 0,
    });
    const info = await parser.getInfo();
    if (info.total > MAX_EXTRACTION_PAGES) {
      throw new PdfExtractionError(
        "Development extraction supports PDFs with up to 100 pages.",
      );
    }
    const pages: PdfExtraction["pages"] = [];
    let characterCount = 0;
    // Parse one page at a time so we can stop before collecting excessive text.
    for (let pageNumber = 1; pageNumber <= info.total; pageNumber++) {
      const result = await parser.getText({
        partial: [pageNumber],
        pageJoiner: "",
        parseHyperlinks: false,
      });
      const text = (result.pages[0]?.text ?? "")
        .replace(/\r\n?/g, "\n")
        .replaceAll("\u0000", "")
        .trim();
      characterCount += text.length;
      if (characterCount > MAX_EXTRACTED_CHARACTERS) {
        throw new PdfExtractionError(
          "This PDF exceeds the development extraction limit of 200,000 characters.",
        );
      }
      pages.push({ pageNumber, text });
    }
    return {
      status: characterCount ? "extracted" : "no_text",
      pageCount: info.total,
      characterCount,
      emptyPageCount: pages.filter((page) => !page.text).length,
      pages,
    };
  } catch (cause) {
    if (cause instanceof PdfExtractionError) throw cause;
    if (cause instanceof Error && cause.name === "PasswordException") {
      throw new PdfExtractionError(
        "Password-protected PDFs are not supported in this phase. Use an unlocked copy.",
      );
    }
    throw new PdfExtractionError(
      "The PDF could not be read. It may be corrupted or use an unsupported format.",
    );
  } finally {
    // Release the PDF document and worker resources on success or failure.
    await parser?.destroy().catch(() => undefined);
  }
}
