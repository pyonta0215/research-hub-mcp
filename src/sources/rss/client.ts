import { XMLParser } from "fast-xml-parser";
import { cache } from "../../core/cache.js";
import type { FeedDef } from "../../core/config.js";
import { fetchText } from "../../core/http.js";
import { logger } from "../../core/logger.js";
import { stripHtml, trimTo } from "../../core/text.js";
import { asArray } from "../types.js";

// RSS 2.0 / Atom / RSS 1.0 (RDF) の3形式を正規化して返す。
// processEntities: false — はてブ等のRDFはエンティティ数がfast-xml-parserの
// 展開上限を超える。実体参照の解決はstripHtml側で行うため展開不要。
const parser = new XMLParser({ ignoreAttributes: false, processEntities: false });

export interface FeedEntry {
  title: string;
  link: string;
  published?: string;
  summary?: string;
  feedName: string;
}

type Raw = Record<string, unknown>;

const textOf = (v: unknown): string => {
  if (v == null) return "";
  if (typeof v === "object") {
    const o = v as Raw;
    return String(o["#text"] ?? o["@_href"] ?? "");
  }
  return String(v);
};

function linkOf(v: unknown): string {
  // Atomのlinkは配列 or {@_href}。rel=alternate優先
  const links = asArray(v as Raw | Raw[]);
  if (!links.length) return "";
  if (typeof links[0] === "string") return String(links[0]);
  const alt = links.find((l) => (l as Raw)["@_rel"] === "alternate" || !(l as Raw)["@_rel"]);
  return String(((alt ?? links[0]) as Raw)["@_href"] ?? "");
}

function toIso(v: unknown): string | undefined {
  const s = textOf(v);
  if (!s) return undefined;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

function normalize(raw: Raw, feedName: string): FeedEntry {
  const summarySrc = textOf(raw.description ?? raw.summary ?? raw["content:encoded"] ?? raw.content);
  return {
    title: stripHtml(textOf(raw.title)) || "(no title)",
    link: typeof raw.link === "string" ? raw.link : linkOf(raw.link),
    published: toIso(raw.pubDate ?? raw.published ?? raw.updated ?? raw["dc:date"]),
    summary: summarySrc ? trimTo(stripHtml(summarySrc), 200) : undefined,
    feedName,
  };
}

export async function fetchFeed(def: FeedDef): Promise<FeedEntry[]> {
  return cache.getOrSet(`rss:feed:${def.url}`, 10 * 60_000, async () => {
    const xml = await fetchText(def.url, { timeoutMs: 15000 });
    const doc = parser.parse(xml) as Raw;
    const rss = doc.rss as Raw | undefined;
    const channel = rss?.channel as Raw | undefined;
    const feed = doc.feed as Raw | undefined;
    const rdf = doc["rdf:RDF"] as Raw | undefined;
    const raw: Raw[] = channel?.item
      ? asArray(channel.item as Raw | Raw[])
      : feed?.entry
        ? asArray(feed.entry as Raw | Raw[])
        : rdf?.item
          ? asArray(rdf.item as Raw | Raw[])
          : [];
    const entries = raw.map((r) => normalize(r, def.name)).filter((e) => e.link);
    logger.debug({ op: "rss_fetch", feed: def.name, entries: entries.length });
    return entries;
  });
}
