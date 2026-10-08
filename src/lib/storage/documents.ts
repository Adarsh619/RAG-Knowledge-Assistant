export const DOCUMENT_BUCKET = "documents";
export const PDF_MIME_TYPE = "application/pdf";
export const MAX_PDF_BYTES = 4 * 1024 * 1024;
export const MAX_PDF_SIZE_LABEL = "4 MiB";
export const DOCUMENT_PAGE_SIZE = 50;

const documentIdPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}--[A-Za-z0-9_-]{1,100}\.pdf$/;

export function validatePdfSelection(
  file: Pick<File, "name" | "type" | "size">,
) {
  if (
    !file.name.toLowerCase().endsWith(".pdf") ||
    file.type !== PDF_MIME_TYPE
  ) {
    return "Choose a PDF file (.pdf, application/pdf).";
  }
  if (file.size === 0) return "The selected file is empty.";
  if (file.size > MAX_PDF_BYTES)
    return `Choose a PDF no larger than ${MAX_PDF_SIZE_LABEL}.`;
  return null;
}

export async function hasPdfHeader(file: Blob) {
  const header = new Uint8Array(await file.slice(0, 5).arrayBuffer());
  return [0x25, 0x50, 0x44, 0x46, 0x2d].every(
    (byte, index) => header[index] === byte,
  );
}

export function createDocumentId(filename: string) {
  const basename = filename.split(/[\\/]/).pop() ?? "document.pdf";
  const safeName =
    basename
      .replace(/\.pdf$/i, "")
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^A-Za-z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 100) || "document";
  return `${crypto.randomUUID()}--${safeName}.pdf`;
}

export function isDocumentId(value: unknown): value is string {
  return typeof value === "string" && documentIdPattern.test(value);
}

export function documentDisplayName(id: string) {
  return id.slice(38); // 36-character UUID followed by "--".
}

export function formatFileSize(bytes: number | null) {
  if (bytes === null) return "Size unavailable";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
}
