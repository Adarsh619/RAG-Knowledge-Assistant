import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { Icon } from "@/components/ui/icon";
import { DocumentsWorkspace } from "@/components/documents/documents-workspace";

export const metadata: Metadata = { title: "Documents" };

export default function DocumentsPage() {
  return (
    <>
      <PageHeader
        eyebrow="YOUR SOURCE OF TRUTH"
        title="Document library"
        description="Upload and manage the private PDFs that will power your knowledge assistant."
        action={
          <a href="#pdf-upload" className="primary-link">
            <Icon name="upload" /> Add PDF
          </a>
        }
      />
      <DocumentsWorkspace />
    </>
  );
}
