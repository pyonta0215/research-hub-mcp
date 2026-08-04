export const collapseWs = (s: string): string => s.replace(/\s+/g, " ").trim();

const entities: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#x27;": "'",
  "&#39;": "'",
  "&nbsp;": " ",
};

export function stripHtml(s: string): string {
  const noTags = s
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]*>/g, " ");
  // 数値文字参照（&#x30A2; 等）→ 名前付きエンティティの順にデコード。
  // 日本語フィードは数値参照が主なので先に解決しないとタイトルが消える
  const decoded = noTags
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => safeCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d: string) => safeCodePoint(Number(d)));
  return collapseWs(decoded.replace(/&[a-z]+;/gi, (m) => entities[m.toLowerCase()] ?? " "));
}

function safeCodePoint(cp: number): string {
  try {
    return String.fromCodePoint(cp);
  } catch {
    return " ";
  }
}

/** LLMに返す文字列は必ず上限を切る。youtube-mcpのtrimDesc()と同じ思想 */
export function trimTo(s: string | undefined | null, n: number): string | undefined {
  if (!s) return undefined;
  const t = collapseWs(String(s));
  if (!t) return undefined;
  return t.length > n ? `${t.slice(0, n)}…` : t;
}
