import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

// 設定は2層: 環境変数（秘密情報）＋ config/feeds.json（購読リスト＝ユーザー資産）。
// 秘密情報をファイルに書かせない。

export interface FeedDef {
  name: string;
  url: string;
}

const pkgRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

export function feedsPath(): string {
  return process.env.RESEARCH_HUB_FEEDS ?? path.join(pkgRoot, "config", "feeds.json");
}

let ghCliToken: string | undefined | null = null; // null=未試行

/**
 * GitHub APIトークン（任意）。GITHUB_TOKEN → GH_TOKEN → gh CLI の順で解決。
 * gh CLIフォールバックにより、ghログイン済みならトークン設定なしで高レートになる
 */
export function githubToken(): string | undefined {
  const env = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;
  if (env) return env;
  if (ghCliToken === null) {
    try {
      ghCliToken = execFileSync("gh", ["auth", "token"], {
        timeout: 3000,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim() || undefined;
    } catch {
      ghCliToken = undefined; // gh未導入・未ログインは正常系
    }
  }
  return ghCliToken;
}

export function loadFeeds(): FeedDef[] {
  try {
    const feeds = JSON.parse(readFileSync(feedsPath(), "utf8")) as FeedDef[];
    return feeds.filter((f) => f && typeof f.name === "string" && typeof f.url === "string");
  } catch {
    return [];
  }
}
