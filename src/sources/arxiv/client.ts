import { XMLParser } from "fast-xml-parser";
import { fetchText } from "../../core/http.js";

// arXiv API: 無料・無認証。礼儀として3秒間隔（公式推奨）。
// https://info.arxiv.org/help/api/index.html
const parser = new XMLParser({ ignoreAttributes: false });

export interface ArxivEntry {
  id: string;
  title: unknown;
  summary: unknown;
  published?: string;
  updated?: string;
  author?: { name: string } | { name: string }[];
  category?: { "@_term": string } | { "@_term": string }[];
  link?: unknown;
}

export async function query(params: {
  search_query?: string;
  id_list?: string;
  max_results: number;
  sortBy?: "relevance" | "submittedDate";
  sortOrder?: "ascending" | "descending";
}): Promise<ArxivEntry[]> {
  const u = new URL("https://export.arxiv.org/api/query");
  if (params.search_query) u.searchParams.set("search_query", params.search_query);
  if (params.id_list) u.searchParams.set("id_list", params.id_list);
  u.searchParams.set("max_results", String(params.max_results));
  if (params.sortBy) u.searchParams.set("sortBy", params.sortBy);
  if (params.sortOrder) u.searchParams.set("sortOrder", params.sortOrder);
  const xml = await fetchText(u.toString(), {
    rateKey: "arxiv",
    minIntervalMs: 3000,
    timeoutMs: 25000,
  });
  const doc = parser.parse(xml) as { feed?: { entry?: ArxivEntry | ArxivEntry[] } };
  const e = doc.feed?.entry;
  return e == null ? [] : Array.isArray(e) ? e : [e];
}
