import { fetchJson } from "../../core/http.js";

// HN Algolia API: 無料・無認証。https://hn.algolia.com/api
const BASE = "https://hn.algolia.com/api/v1";

export interface HnHit {
  objectID: string;
  title?: string | null;
  url?: string | null;
  author?: string | null;
  points?: number | null;
  num_comments?: number | null;
  created_at: string;
  story_text?: string | null;
}

export interface HnSearchRes {
  hits: HnHit[];
}

export function searchStories(params: {
  query?: string;
  tags: string;
  numericFilters?: string;
  byDate?: boolean;
  hitsPerPage: number;
}): Promise<HnSearchRes> {
  const u = new URL(`${BASE}/${params.byDate ? "search_by_date" : "search"}`);
  if (params.query) u.searchParams.set("query", params.query);
  u.searchParams.set("tags", params.tags);
  if (params.numericFilters) u.searchParams.set("numericFilters", params.numericFilters);
  u.searchParams.set("hitsPerPage", String(params.hitsPerPage));
  return fetchJson<HnSearchRes>(u.toString(), { rateKey: "hackernews", minIntervalMs: 200 });
}

export interface HnItemNode {
  id: number;
  title?: string | null;
  text?: string | null;
  url?: string | null;
  author?: string | null;
  points?: number | null;
  created_at: string;
  type: string;
  children?: HnItemNode[];
}

export const getItemTree = (id: string): Promise<HnItemNode> =>
  fetchJson<HnItemNode>(`${BASE}/items/${id}`, { rateKey: "hackernews", minIntervalMs: 200 });
