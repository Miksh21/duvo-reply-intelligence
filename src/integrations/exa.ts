import { config } from "../config";
import type { ExaResult } from "../types";

interface ExaApiResult {
  title?: string | null;
  url: string;
  text?: string;
  highlights?: string[];
  publishedDate?: string;
  author?: string;
}

/**
 * Low-level Exa client — a single neural search. Trigger B runs three of these
 * in parallel (see triggerB/exaSearch.ts).
 *
 * Body mirrors the brief: type "neural", contents { text, highlights },
 * numResults 5. Result text is capped to keep the synthesis prompt cheap; the
 * full highlights still flow through.
 */
export async function exaSearch(
  query: string,
  numResults: number = config.exaNumResults,
): Promise<ExaResult[]> {
  const res = await fetch("https://api.exa.ai/search", {
    method: "POST",
    headers: {
      "x-api-key": config.exaApiKey,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      query,
      type: "neural",
      numResults,
      contents: { text: true, highlights: true },
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Exa search failed: ${res.status} ${res.statusText} ${body}`.trim());
  }

  const data = (await res.json()) as { results?: ExaApiResult[] };
  return (data.results ?? []).map((r) => ({
    title: r.title?.trim() || r.url,
    url: r.url,
    text: (r.text ?? "").slice(0, 1200),
    highlights: r.highlights ?? [],
    publishedDate: r.publishedDate,
    author: r.author,
  }));
}
