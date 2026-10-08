// Public synthetic fixtures for extraction tests. No user document is read.
export function createTextPdf(
  pages = [
    "Phase 5 local PDF extraction",
    "Page two preserves its source page number.",
  ],
) {
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  const pageIds = [];
  for (const text of pages) {
    const pageId = objects.length + 1;
    const contentId = pageId + 1;
    pageIds.push(pageId);
    const lines = text
      ?.split("\n")
      .map((line) => line.replace(/([\\()])/g, "\\$1"));
    const content =
      text === null
        ? "q 150 0 0 150 72 500 cm BI /W 1 /H 1 /BPC 8 /CS /RGB /F /AHx ID ff0000> EI Q\n"
        : text
          ? `BT /F1 12 Tf 14 TL 72 720 Td ${lines.map((line) => `(${line}) Tj T*`).join("\n")} ET\n`
          : "";
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentId} 0 R >>`,
    );
    objects.push(
      `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}endstream`,
    );
  }
  objects[1] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`;
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${offsets.length}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1))
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf);
}

export const corruptPdf = Buffer.from(
  "%PDF-1.7\nThis disposable file deliberately has no PDF objects or cross-reference table.\n",
);
