import type { Item, ItemFull } from "../../core/schema.js";
import { githubToken } from "../../core/config.js";
import { trimTo } from "../../core/text.js";
import type { SourceAdapter } from "../types.js";
import { getLatestRelease, getReadmeRaw, getRepo, searchRepos, type GhRepo } from "./client.js";

const isoDate = (d: Date): string => d.toISOString().slice(0, 10);

function toItem(r: GhRepo): Item {
  return {
    id: `github:${r.full_name}`,
    source: "github",
    type: "repo",
    title: r.full_name,
    url: r.html_url,
    author: r.owner?.login,
    published_at: r.created_at,
    score: r.stargazers_count,
    snippet: trimTo(r.description, 120),
  };
}

export const github: SourceAdapter = {
  name: "github",
  capabilities: {
    search: true,
    trending: true,
    getItem: true,
    categories: ["typescript", "python", "rust", "go", "swift"],
    notes:
      "trendingは「直近に作られた急成長リポジトリ」（categoryは言語で絞り込み）。" +
      (githubToken()
        ? "GITHUB_TOKEN設定済み"
        : "GITHUB_TOKEN未設定のため検索は10回/分に自主規制中。環境変数で設定すると30回/分になる"),
  },

  async search(q) {
    const parts = [q.query, "in:name,description,readme"];
    if (q.since) parts.push(`pushed:>${isoDate(q.since)}`);
    const sort = q.sort === "date" ? "updated" : q.sort === "score" ? "stars" : undefined;
    const res = await searchRepos({ q: parts.join(" "), sort, per_page: q.limit });
    return res.items.map(toItem);
  },

  async trending(q) {
    const days = q.period === "week" ? 7 : 1;
    const created = new Date(Date.now() - days * 86400_000);
    const parts = [`created:>${isoDate(created)}`, "stars:>10"];
    if (q.category) parts.push(`language:${q.category}`);
    const res = await searchRepos({ q: parts.join(" "), sort: "stars", per_page: q.limit });
    return res.items.map(toItem);
  },

  async getItem(nativeId, opts) {
    const [repo, readme, release] = await Promise.all([
      getRepo(nativeId),
      getReadmeRaw(nativeId),
      getLatestRelease(nativeId),
    ]);
    return {
      ...toItem(repo),
      body: trimTo(readme, opts.maxLength),
      extra: {
        stars: repo.stargazers_count,
        forks: repo.forks_count,
        open_issues: repo.open_issues_count,
        language: repo.language,
        license: repo.license?.spdx_id,
        topics: repo.topics,
        pushed_at: repo.pushed_at,
        archived: repo.archived,
        latest_release: release
          ? { tag: release.tag_name, name: release.name, published_at: release.published_at }
          : undefined,
      },
    } satisfies ItemFull;
  },

  matchesUrl: (u) => /github\.com\/[^/]+\/[^/]+/.test(u),
  idFromUrl: (u) => {
    const m = u.match(/github\.com\/([^/]+\/[^/#?]+)/);
    return m?.[1]?.replace(/\.git$/, "");
  },
};
