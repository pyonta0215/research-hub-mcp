import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { logger } from "./logger.js";

// 設定は2層: 環境変数（秘密情報）＋ config/feeds.json（購読リスト＝ユーザー資産）。
// 秘密情報をファイルに書かせない。

export interface FeedDef {
  name: string;
  url: string;
}

/**
 * パッケージのルート。ライブラリとして他プロジェクトにバンドルされる場合、
 * バンドラがCJS出力すると import.meta.url が失われる（esbuild は空オブジェクトに置換する）ため、
 * トップレベルで評価せず・失敗しても落とさない。その環境では RESEARCH_HUB_FEEDS の指定が前提。
 */
function pkgRoot(): string | undefined {
  try {
    return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
  } catch {
    return undefined;
  }
}

export function feedsPath(): string | undefined {
  const env = process.env.RESEARCH_HUB_FEEDS;
  if (env) return env;
  const root = pkgRoot();
  return root ? path.join(root, "config", "feeds.json") : undefined;
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
  const p = feedsPath();
  if (!p) {
    warnFeedsOnce("購読リストの場所を解決できません。RESEARCH_HUB_FEEDS を指定してください");
    return [];
  }
  try {
    const feeds = JSON.parse(readFileSync(p, "utf8")) as FeedDef[];
    return feeds.filter((f) => f && typeof f.name === "string" && typeof f.url === "string");
  } catch (e) {
    // 読めない＝rssソースが常に0件になる。黙って空を返すと原因が追えないため必ず1度は警告する
    warnFeedsOnce(String(e));
    return [];
  }
}

let feedsWarned = false;
function warnFeedsOnce(reason: string): void {
  if (feedsWarned) return;
  feedsWarned = true;
  logger.warn({ op: "feeds_unavailable", path: process.env.RESEARCH_HUB_FEEDS, reason });
}
