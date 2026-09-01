import { SPACING_ROWS, type Problem, Settings, GenerationResult } from "./types";

/**
 * 题目生成引擎
 *
 * 规则：
 * - 单式(a±b)：加法池 a + b ≤ N；减法池 a ≥ b ≥ 0，结果非负
 * - 多连(a±b±c...)：每步中间结果与最终结果都在 [0, N] 内
 * - 括号((a±b)±c / a±(b±c))：括号内与外层结果都在 [0, N] 内
 * - 按多连占比、括号占比、单式占比混合取题
 */

function randInt(lo: number, hi: number): number {
  return lo + Math.floor(Math.random() * (hi - lo + 1));
}

function randOp(): "+" | "-" {
  return Math.random() < 0.5 ? "+" : "-";
}

const apply = (a: number, b: number, op: "+" | "-") =>
  op === "+" ? a + b : a - b;

const SIMPLE = (a: number, b: number, op: "+" | "-"): Problem & { kind: "s" } => ({
  kind: "s",
  a,
  b,
  op,
});

/** 生成单式题（a ± b），全部唯一 */
function buildSimplePool(n: number): (Problem & { kind: "s" })[] {
  const pool: (Problem & { kind: "s" })[] = [];
  for (let a = 0; a <= n; a++) {
    for (let b = 0; b <= n - a; b++) pool.push(SIMPLE(a, b, "+"));
  }
  for (let a = 1; a <= n; a++) {
    for (let b = 0; b <= a; b++) pool.push(SIMPLE(a, b, "-"));
  }
  return pool;
}

/**
 * 生成多连题，项数 terms ∈ [2,4]。
 * 每一步的中间结果与最终结果都控制在 [0, n] 内。
 */
function genMulti(n: number, terms: number): Problem {
  const nums = [randInt(0, n)];
  const ops: ("+" | "-")[] = [];
  let cur = nums[0];
  for (let i = 1; i < terms; i++) {
    const op = randOp();
    // 加法加数需 <= n - cur（保证 cur+加数 <= n）；减法减数需 <= cur（保证结果 >= 0）
    const v = op === "+" ? randInt(0, n - cur) : randInt(0, cur);
    nums.push(v);
    ops.push(op);
    cur = apply(cur, v, op);
  }
  return { kind: "m", nums, ops };
}

/** 生成括号题：(a±b)±c 或 a±(b±c)，括号内与外层结果均控制在 [1…, n] 内 */
function genParen(n: number): Problem {
  while (true) {
    const n1 = randInt(1, n);
    const n2 = randInt(1, n);
    const n3 = randInt(1, n);
    const o1 = randOp();
    const o2 = randOp();
    const parenAt: 0 | 1 = Math.random() < 0.5 ? 0 : 1;
    const inner = parenAt === 0 ? apply(n1, n2, o1) : apply(n2, n3, o2);
    const outer = parenAt === 0 ? apply(inner, n3, o2) : apply(n1, inner, o1);
    // 括号内与外层结果都必须在 [0, n]
    if (inner < 0 || inner > n || outer < 0 || outer > n) continue;
    return { kind: "p", n1, o1, n2, o2, n3, parenAt };
  }
}

/** 生成一道多连/括号题 */
function genComplex(settings: Settings, kind: "m" | "p"): Problem {
  const terms = Math.max(2, Math.min(4, settings.maxTerms));
  return kind === "m" ? genMulti(settings.n, terms) : genParen(settings.n);
}

/** 生成内容键（含具体数字，用于去重） */
function keyOf(p: Problem): string {
  switch (p.kind) {
    case "s":
      return `s:${p.a},${p.b},${p.op}`;
    case "m":
      return `m:${p.nums.join(",")}:${p.ops.join("")}`;
    case "p":
      return `p:${p.n1},${p.o1},${p.n2},${p.o2},${p.n3},${p.parenAt}`;
  }
}

function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** 避免相邻题相同：相邻相同则尝试与后方交换 */
function deconflictAdjacent(items: Problem[]): void {
  for (let i = 1; i < items.length; i++) {
    if (keyOf(items[i]) !== keyOf(items[i - 1])) continue;
    for (let j = i + 1; j < items.length; j++) {
      if (keyOf(items[j]) !== keyOf(items[i - 1])) {
        [items[i], items[j]] = [items[j], items[i]];
        break;
      }
    }
  }
}

/**
 * 生成一份试卷。
 * 按 multiRatio / parenRatio / 其余(单式) 权重分配各类题数，
 * 单式再按 addRatio 拆分为加减。分页后每页再独立洗牌并规避相邻重复。
 */
export function generateProblems(settings: Settings): GenerationResult {
  const perPage = settings.cols * SPACING_ROWS[settings.spacing];
  const total = perPage * settings.pages;
  const clamp = (x: number) => Math.max(0, Math.min(100, x));
  const multi = clamp(settings.multiRatio);
  // 括号题仅当「连加减项数 > 2 且连加减占比 > 0」时才生效，否则归入其他题型
  const parenEnabled = settings.maxTerms > 2 && multi > 0;
  const paren = parenEnabled ? clamp(settings.parenRatio) : 0;

  // 各题型题数（round，随后修正到 total）
  let countParen = Math.round((total * paren) / 100);
  let countMulti = Math.round((total * multi) / 100);
  let countSimple = total - countParen - countMulti;

  const items: Problem[] = [];
  for (let i = 0; i < countParen; i++) items.push(genComplex(settings, "p"));
  for (let i = 0; i < countMulti; i++) items.push(genComplex(settings, "m"));

  if (countSimple > 0) {
    const pool = shuffle(buildSimplePool(settings.n));
    const wantAdd = Math.round((countSimple * settings.addRatio) / 100);
    // 按加法优先取唯一题
    const taken = new Set<string>(items.map(keyOf));
    let addGot = 0;
    for (const p of pool) {
      if (countSimple <= 0) break;
      if (taken.has(keyOf(p))) continue;
      if (p.op === "+" && addGot >= wantAdd) continue; // 加法已取满
      taken.add(keyOf(p));
      items.push(p);
      countSimple--;
      if (p.op === "+") addGot++;
    }
    // 池耗尽仍未取满时，放宽重复补齐
    while (countSimple > 0) {
      items.push(genSimpleFrom(addGot < wantAdd, settings.n));
      countSimple--;
    }
  }

  // 修正最小偏差导致的题数偏差
  while (items.length < total) items.push(genComplex(settings, Math.random() < 0.5 ? "m" : "p"));
  if (items.length > total) items.length = total;

  shuffle(items);
  deconflictAdjacent(items);

  const pages: Problem[][] = [];
  for (let i = 0; i < settings.pages; i++) {
    const pageItems = items.slice(i * perPage, (i + 1) * perPage);
    shuffle(pageItems);
    deconflictAdjacent(pageItems);
    pages.push(pageItems);
  }

  const notice =
    settings.n < 4 && total > 20
      ? "N 较小时题量过大，部分题目可能重复"
      : undefined;

  return { pages, notice };
}

/** 生成一道可重复的简单题（补齐用） */
function genSimpleFrom(add: boolean, n: number): Problem {
  if (add) {
    const a = randInt(0, n);
    const b = randInt(0, n - a);
    return { kind: "s", a, b, op: "+" };
  }
  const a = randInt(0, n);
  const b = randInt(0, a);
  return { kind: "s", a, b, op: "-" };
}