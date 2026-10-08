export interface ExtractedPage {
  pageNumber: number;
  text: string;
}

export interface PdfExtraction {
  status: "extracted" | "no_text";
  pageCount: number;
  characterCount: number;
  emptyPageCount: number;
  pages: ExtractedPage[];
}

export interface ExtractionResponse {
  document: { id: string; name: string };
  extraction: PdfExtraction;
}
