import type { Item, ItemFull } from "../core/schema.js";

export interface SearchQuery {
  query: string;
  since?: Date;
  /** ソースあたりの最大件数 */
  limit: number;
  sort: "relevance" | "date" | "score";
}

export interface TrendingQuery {
  category?: string;
  period: "day" | "week";
  limit: number;
}

export interface ItemOptions {
  /** body系フィールドの最大文字数 */
  maxLength: number;
}

/**
 * ソース追加＝このインターフェースを実装した1ディレクトリを足して
 * registry.ts に1行追加するだけ。ツール定義・Service層・スキーマは触らない。
 */
export interface SourceAdapter {
  name: string;
  capabilities: {
    search: boolean;
    trending: boolean;
    getItem: boolean;
    /** trendingのcategoryに渡せる語彙の例 */
    categories?: string[];
    /** AIに伝えたい注意事項 */
    notes?: string;
  };
  search(q: SearchQuery): Promise<Item[]>;
  trending(q: TrendingQuery): Promise<Item[]>;
  getItem(nativeId: string, opts: ItemOptions): Promise<ItemFull>;
  /** URLがこのソースのものか（get_itemのURL自動判別に使う） */
  matchesUrl?(url: string): boolean;
  /** URL → native id の変換 */
  idFromUrl?(url: string): string | undefined;
}

export const asArray = <T>(x: T | T[] | undefined | null): T[] =>
  x == null ? [] : Array.isArray(x) ? x : [x];
