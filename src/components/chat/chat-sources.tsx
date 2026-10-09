import type { RagSource } from "@/types/rag";
import { formatSourcePages, groupRagSources } from "@/lib/rag/source-presentation";

export function ChatSources({ sources }: { sources: RagSource[] }) {
  if (!sources.length) return null;
  const groups = groupRagSources(sources);
  return (
    <section aria-label="Answer sources" className="mt-4 border-t border-slate-200 pt-3">
      <h3 className="text-xs font-semibold text-emerald-800">Sources</h3>
      <p className="mt-1 text-xs leading-5 text-slate-500">
        Context supplied to the model. These passages may not answer every part of your question;
        inspect the evidence to check the answer. Similarity is relevance, not certainty.
      </p>
      <ol className="mt-2 space-y-2">
        {groups.map((group, index) => (
          <li key={group.documentId}>
            <details className="rounded-lg border border-slate-200 bg-white p-3">
              <summary className="cursor-pointer text-xs font-medium leading-5 wrap-anywhere">
                [{index + 1}] {group.originalFilename} — {formatSourcePages(group.pageNumbers)}
                <span className="ml-2 font-normal text-slate-500">({group.sources.length} {group.sources.length === 1 ? "passage" : "passages"})</span>
              </summary>
              <div className="mt-3 space-y-3">
                {group.sources.map((source) => (
                  <div key={source.chunkId} className="border-l-2 border-emerald-100 pl-3">
                    <p className="text-[11px] text-slate-500">
                      Context rank {source.rank} · Chunk {source.chunkIndex} · {formatSourcePages(source.pageNumbers)} · Similarity {source.similarity.toFixed(3)}
                    </p>
                    <blockquote className="mt-1 text-xs leading-5 whitespace-pre-wrap wrap-anywhere">{source.excerpt}</blockquote>
                    {source.excerptTruncated && <p className="mt-1 text-[11px] text-slate-400">Excerpt shortened for display.</p>}
                  </div>
                ))}
              </div>
            </details>
          </li>
        ))}
      </ol>
    </section>
  );
}
