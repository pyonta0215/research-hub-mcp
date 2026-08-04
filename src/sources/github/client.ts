import { fetchJson, fetchText, type FetchOpts } from "../../core/http.js";
import { githubToken } from "../../core/config.js";

// GitHub REST API。GITHUB_TOKEN無しでも動くが検索レートが厳しい（10回/分）。
// トークンあり: 検索30回/分・コア5000回/時。
const BASE = "https://api.github.com";

function opts(): FetchOpts {
  const token = githubToken();
  return {
    rateKey: "github-search",
    // 無認証の検索は10回/分なので6秒間隔で自衛する
    minIntervalMs: token ? 500 : 6000,
    headers: {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  };
}

export interface GhRepo {
  full_name: string;
  html_url: string;
  description?: string | null;
  owner?: { login: string } | null;
  stargazers_count: number;
  forks_count?: number;
  open_issues_count?: number;
  language?: string | null;
  license?: { spdx_id?: string | null } | null;
  topics?: string[];
  created_at: string;
  pushed_at?: string;
  archived?: boolean;
}

export interface GhSearchRes {
  total_count: number;
  items: GhRepo[];
}

export function searchRepos(params: {
  q: string;
  sort?: "stars" | "updated";
  per_page: number;
}): Promise<GhSearchRes> {
  const u = new URL(`${BASE}/search/repositories`);
  u.searchParams.set("q", params.q);
  if (params.sort) u.searchParams.set("sort", params.sort);
  u.searchParams.set("order", "desc");
  u.searchParams.set("per_page", String(params.per_page));
  return fetchJson<GhSearchRes>(u.toString(), opts());
}

export const getRepo = (fullName: string): Promise<GhRepo> =>
  fetchJson<GhRepo>(`${BASE}/repos/${fullName}`, { ...opts(), rateKey: "github-core", minIntervalMs: 200 });

export async function getReadmeRaw(fullName: string): Promise<string | undefined> {
  try {
    return await fetchText(`${BASE}/repos/${fullName}/readme`, {
      ...opts(),
      rateKey: "github-core",
      minIntervalMs: 200,
      headers: { ...opts().headers, Accept: "application/vnd.github.raw+json" },
    });
  } catch {
    return undefined; // READMEなしは正常系
  }
}

export interface GhRelease {
  tag_name: string;
  name?: string | null;
  published_at?: string;
}

export async function getLatestRelease(fullName: string): Promise<GhRelease | undefined> {
  try {
    return await fetchJson<GhRelease>(`${BASE}/repos/${fullName}/releases/latest`, {
      ...opts(),
      rateKey: "github-core",
      minIntervalMs: 200,
      retries: 0,
    });
  } catch {
    return undefined; // リリース未作成は正常系
  }
}
