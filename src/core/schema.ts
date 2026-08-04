// 統一Itemスキーマ — このプロジェクトの憲法。
// 全ソースのアダプタはAPIレスポンスをこの形に変換して返す。
// 共通フィールドの純度を守るため、ソース固有の情報は extra に隔離する。

export type ItemType = "article" | "paper" | "repo" | "discussion" | "release";

/** 一覧系（search / trending）が返す compact 形式 */
export interface Item {
  /** "source:native_id"。research_get_item にそのまま渡せる */
  id: string;
  source: string;
  type: ItemType;
  title: string;
  /** 一次URL（HNなら外部リンク先） */
  url?: string;
  /** 議論の場のURL（HNスレ等） */
  discussion_url?: string;
  author?: string;
  /** ISO 8601 */
  published_at?: string;
  /** ソース内の相対的な熱量。ソース間で正規化しない（比較不能なため） */
  score?: number;
  num_comments?: number;
  /** 冒頭・要旨の短い抜粋 */
  snippet?: string;
  /** 重複排除で吸収された同一URLの別ソースid */
  also_on?: string[];
}

/** get_item が返す full 形式 */
export interface ItemFull extends Item {
  /** 本文・アブストラクト（max_lengthで切り詰め済み） */
  body?: string;
  /** 上位コメントの抜粋など */
  highlights?: string[];
  /** ソース固有情報の隔離場所 */
  extra?: Record<string, unknown>;
}

/** ツール応答の外殻。部分失敗を隠さない */
export interface ResearchResult<T> {
  items: T[];
  /** ソース別ヒット数 */
  stats: Record<string, number>;
  /** 失敗したソースとその理由（全滅でない限り応答は成功させる） */
  errors: string[];
  hint?: string;
}
