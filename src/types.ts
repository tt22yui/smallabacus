/** 单道题目 */
export type Problem =
  | { kind: "s"; a: number; b: number; op: "+" | "-" }
  /** 多连加减，如 2+3+6 */
  | { kind: "m"; nums: number[]; ops: ("+" | "-")[] }
  /** 括号连加减，如 (2+3)+6 或 8-(3+2) */
  | {
      kind: "p";
      n1: number;
      o1: "+" | "-";
      n2: number;
      o2: "+" | "-";
      n3: number;
      parenAt: 0 | 1;
    };

export type Spacing = "compact" | "normal" | "loose";

/** 每页行数档位（题目间隔）；待用户后续微调 */
export const SPACING_ROWS: Record<Spacing, number> = {
  compact: 17,
  normal: 13,
  loose: 10,
};

export const SPACING_LABELS: Record<Spacing, string> = {
  compact: "紧凑",
  normal: "适中",
  loose: "宽松",
};

export type ProblemKind = "s" | "m" | "p";

export function problemKindOf(p: Problem): ProblemKind {
  return p.kind;
}

/** 用户生成设置 */
export interface Settings {
  /** 范围上限 N（0~N 以内，作用于单个数字） */
  n: number;
  /** 每行题数（列数） */
  cols: number;
  /** 页数 */
  pages: number;
  /** 题目间隔档位：精凑/适中/宽松，决定每页行数并铺满纸张 */
  spacing: Spacing;
  /** 单式题中加法占比百分比，10~90 */
  addRatio: number;
  /** 加数个数（多连题 / 括号题的项数），2~4 */
  maxTerms: number;
  /** 多连题占比百分比，0~100 */
  multiRatio: number;
  /** 括号题占比百分比，0~100 */
  parenRatio: number;
  /** 姓名 */
  name: string;
  /** 日期（如 2026-08-17），留空则自动填当天 */
  date: string;
  /** 背景图 id（内置 'bg1'..'bg5' 或 'none'，或自定义 URL 前缀 'custom:'） */
  bg: string;
}

export const DEFAULT_SETTINGS: Settings = {
  n: 10,
  cols: 5,
  pages: 1,
  spacing: "normal",
  addRatio: 60,
  maxTerms: 3,
  multiRatio: 0,
  parenRatio: 0,
  name: "",
  date: "",
  bg: "bg1",
};

export interface GenerationResult {
  /** 每页的题目数组 */
  pages: Problem[][];
  /** 提示信息（如题量超过组合上限） */
  notice?: string;
}
