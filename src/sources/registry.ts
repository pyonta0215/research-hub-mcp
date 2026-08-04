import type { SourceAdapter } from "./types.js";
import { hackernews } from "./hackernews/adapter.js";
import { arxiv } from "./arxiv/adapter.js";
import { rss } from "./rss/adapter.js";
import { github } from "./github/adapter.js";

// ソース追加はここに1行足すだけ（例: bluesky）
export const adapters: SourceAdapter[] = [hackernews, arxiv, rss, github];

export const adapterNames = adapters.map((a) => a.name);

export function getAdapter(name: string): SourceAdapter | undefined {
  return adapters.find((a) => a.name === name);
}
