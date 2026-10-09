import type { RagSource } from "../../types/rag.ts";

// This browser-safe module groups presentation only. Every evidence record stays intact.
export function groupRagSources(sources: readonly RagSource[]) {
  const groups = new Map<string, {
    documentId: string; originalFilename: string; pageNumbers: number[]; sources: RagSource[];
  }>();
  for (const source of [...sources].sort((a, b) => a.rank - b.rank)) {
    let group = groups.get(source.documentId);
    if (!group) {
      group = { documentId: source.documentId, originalFilename: source.originalFilename, pageNumbers: [], sources: [] };
      groups.set(source.documentId, group);
    }
    if (group.sources.some((existing) => existing.chunkId === source.chunkId)) continue;
    group.sources.push(source);
    group.pageNumbers = [...new Set([...group.pageNumbers, ...source.pageNumbers])].sort((a, b) => a - b);
  }
  return [...groups.values()];
}

export function formatSourcePages(pages: readonly number[]) {
  const ordered = [...new Set(pages)].sort((a, b) => a - b);
  if (!ordered.length) return "Page unavailable";
  const ranges: string[] = [];
  for (let i = 0; i < ordered.length; i++) {
    const first = ordered[i];
    let last = first;
    while (ordered[i + 1] === last + 1) last = ordered[++i];
    ranges.push(first === last ? String(first) : `${first}–${last}`);
  }
  return `${ordered.length === 1 ? "Page" : "Pages"} ${ranges.join(", ")}`;
}
