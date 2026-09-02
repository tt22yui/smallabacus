import { useCallback, useEffect, useMemo, useState } from "react";
import { generateProblems } from "./generator";
import {
  BUILTIN_BACKGROUNDS,
  backgroundName,
  resolveBackgroundSrc,
} from "./backgrounds";
import { DEFAULT_SETTINGS, SPACING_LABELS, SPACING_ROWS, type GenerationResult, type Problem, type Settings, type Spacing } from "./types";

/** 题目字号统一用适中字号，三档仅行距不同；grid 用 content-between 拉伸占满 */
const SPACING_STYLE: Record<Spacing, { font: string; gap: string }> = {
  compact: { font: "text-base sm:text-lg", gap: "gap-y-0.5" },
  normal: { font: "text-lg sm:text-xl", gap: "gap-y-3" },
  loose: { font: "text-lg sm:text-xl", gap: "gap-y-5" },
};

/** 背景缩略图列表：内置 + 无背景 */
const BG_OPTIONS = [
  { id: "none", name: "无背景" },
  ...BUILTIN_BACKGROUNDS.map((b) => ({ id: b.id, name: b.name })),
];

const STORAGE_KEY = "small-abacus-settings";
const THEME_KEY = "small-abacus-theme";

/** 当前主题（light | dark），默认跟随系统 */
function loadTheme(): "light" | "dark" {
  try {
    const t = localStorage.getItem(THEME_KEY);
    if (t === "light" || t === "dark") return t;
  } catch {
    /* 忽略 */
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    /* 忽略损坏数据 */
  }
  return { ...DEFAULT_SETTINGS };
}

/** 今天日期 YYYY-MM-DD */
function today(): string {
  const d = new Date();
  const pad = (x: number) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function NumberField(props: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
}) {
  const step = props.step ?? 1;
  const clamp = (n: number) => Math.min(props.max, Math.max(props.min, n));
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-sm text-stone-600 dark:text-stone-300">{props.label}</span>
      <div className="flex items-center overflow-hidden rounded-lg border border-stone-200 bg-white shadow-sm focus-within:border-brand-500 dark:border-stone-700 dark:bg-stone-800">
        <button
          type="button"
          onClick={() => props.onChange(clamp(props.value - step))}
          className="flex h-8 w-8 items-center justify-center text-stone-500 transition-colors hover:bg-stone-100 hover:text-brand-600 dark:text-stone-400 dark:hover:bg-stone-700"
          aria-label={`减少 ${props.label}`}
          tabIndex={-1}
        >
          −
        </button>
        <input
          type="number"
          className="h-8 w-14 border-x border-stone-200 bg-transparent text-center text-sm font-medium text-stone-800 focus:outline-none dark:border-stone-700 dark:text-stone-100"
          value={props.value}
          min={props.min}
          max={props.max}
          step={step}
          // 直接输入也统一钳制到 [min, max]，避免越界值进入设置
          onChange={(e) => {
            const v = Number(e.target.value);
            props.onChange(Number.isFinite(v) ? clamp(v) : props.value);
          }}
        />
        <button
          type="button"
          onClick={() => props.onChange(clamp(props.value + step))}
          className="flex h-8 w-8 items-center justify-center text-stone-500 transition-colors hover:bg-stone-100 hover:text-brand-600 dark:text-stone-400 dark:hover:bg-stone-700"
          aria-label={`增加 ${props.label}`}
          tabIndex={-1}
        >
          +
        </button>
      </div>
    </div>
  );
}

function Section(props: { icon: string; title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-stone-200/80 bg-white/70 p-3.5 dark:border-stone-700/60 dark:bg-stone-800/60">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="flex items-center gap-1.5 text-[13px] font-semibold tracking-wide text-stone-500 dark:text-stone-400">
          <span className="text-sm leading-none">{props.icon}</span>
          {props.title}
        </h2>
        {props.hint && (
          <span className="text-[11px] text-stone-300 dark:text-stone-600">{props.hint}</span>
        )}
      </div>
      {props.children}
    </section>
  );
}

/** Tauri 自定义标题栏：可拖拽区域 + 窗口控制按钮 */
function TitleBar() {
  const [maximized, setMaximized] = useState(false);
  const [version, setVersion] = useState<string>("");

  useEffect(() => {
    let canceled = false;
    (async () => {
      try {
        const { getVersion } = await import("@tauri-apps/api/app");
        getVersion().then((v) => {
          if (!canceled) setVersion(v);
        });
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        const appWindow = getCurrentWindow();
        setMaximized(await appWindow.isMaximized());
        // 监听最大化状态变化
        const unlisten = await appWindow.onResized(() => {
          appWindow.isMaximized().then((m) => {
            if (!canceled) setMaximized(m);
          });
        });
        return () => {
          canceled = true;
          if (typeof unlisten === "function") unlisten();
        };
      } catch {
        /* 非 Tauri 环境则忽略 */
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    return () => {};
  }, []);

  const act = (fn: (w: import("@tauri-apps/api/window").Window) => void) => () => {
    import("@tauri-apps/api/window").then(({ getCurrentWindow }) => {
      fn(getCurrentWindow());
    });
  };

  return (
    <div
      data-tauri-drag-region
      className="no-print flex h-10 shrink-0 select-none items-stretch justify-between border-b border-stone-200/70 bg-cream-50 dark:border-stone-800 dark:bg-stone-900"
    >
      {/* 左：可拖拽标题区域 */}
      <div data-tauri-drag-region className="flex items-center gap-2 px-3" style={{ alignSelf: "stretch" }}>
        <span data-tauri-drag-region className="font-display text-[13px] font-semibold tracking-wide text-stone-700 dark:text-stone-300">
          小算盘
        </span>
        <span data-tauri-drag-region className="text-[11px] text-stone-400 dark:text-stone-500">
          试卷生成器
        </span>
        {version && (
          <span data-tauri-drag-region className="rounded border border-stone-300/60 px-1 py-px text-[10px] leading-none text-stone-400 dark:border-stone-700 dark:text-stone-500">
            v{version}
          </span>
        )}
      </div>

      {/* 右：窗口控制按钮，图标统一 flex 居中 */}
      <div className="flex items-stretch">
        <button
          type="button"
          onClick={act((w) => w.minimize())}
          className="flex w-11 items-center justify-center text-stone-500 transition-colors hover:bg-stone-200/70 dark:text-stone-400 dark:hover:bg-stone-800"
          aria-label="最小化"
          title="最小化"
        >
          <span className="block h-px w-3 bg-current" />
        </button>
        <button
          type="button"
          onClick={act((w) => w.toggleMaximize())}
          className="flex w-11 items-center justify-center text-stone-500 transition-colors hover:bg-stone-200/70 dark:text-stone-400 dark:hover:bg-stone-800"
          aria-label={maximized ? "还原" : "最大化"}
          title={maximized ? "还原" : "最大化"}
        >
          <span className="block h-2.5 w-3.5 border border-current" />
        </button>
        <button
          type="button"
          onClick={act((w) => w.close())}
          className="flex w-11 items-center justify-center text-stone-500 transition-colors hover:bg-red-500 hover:text-white dark:text-stone-400"
          aria-label="关闭"
          title="关闭"
        >
          <span className="relative block h-3.5 w-3.5">
            <span className="absolute left-0 top-1/2 block h-px w-full -translate-y-1/2 bg-current" style={{ transform: "translateY(-0.5px) rotate(45deg)" }} />
            <span className="absolute left-0 top-1/2 block h-px w-full -translate-y-1/2 bg-current" style={{ transform: "translateY(-0.5px) rotate(-45deg)" }} />
          </span>
        </button>
      </div>
    </div>
  );
}

function App() {
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [result, setResult] = useState<GenerationResult>(() =>
    generateProblems(loadSettings()),
  );
  const [customBg, setCustomBg] = useState<string>("");
  const [pageIdx, setPageIdx] = useState(0);
  const [theme, setTheme] = useState<"light" | "dark">(loadTheme);

  // 应用主题：切换 <html> 上的 .dark，并记住选择
  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      /* 忽略 */
    }
  }, [theme]);

  const toggleTheme = () =>
    setTheme((t) => (t === "dark" ? "light" : "dark"));

  // 记住设置
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  }, [settings]);

  const update = useCallback(
    (patch: Partial<Settings>) => {
      setSettings((s) => ({ ...s, ...patch }));
    },
    [],
  );

  const regenerate = useCallback(() => {
    setResult(generateProblems(settings));
    setPageIdx(0);
  }, [settings]);

  // 设置变化时自动重新生成（保持实时预览），并回到第 1 页
  useEffect(() => {
    setResult(generateProblems(settings));
    setPageIdx(0);
  }, [settings]);

  // 键盘 ← / → 翻页
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") {
        setPageIdx((i) => Math.max(0, i - 1));
      } else if (e.key === "ArrowRight") {
        setPageIdx((i) => Math.min(result.pages.length - 1, i + 1));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [result.pages.length]);

  const currentPage = Math.min(pageIdx, result.pages.length - 1);

  // 处理自定义背景上传（Tauri 原生对话框 + fs）
  const handleUploadBg = async () => {
    try {
      const dialog = (await import("@tauri-apps/plugin-dialog")).open;
      const fs = await import("@tauri-apps/plugin-fs");
      const filePath = await dialog({
        multiple: false,
        filters: [{ name: "图片", extensions: ["png", "jpg", "jpeg", "webp", "svg"] }],
      });
      if (typeof filePath !== "string") return; // 用户取消
      const data = await fs.readFile(filePath);
      const blob = new Blob([data], { type: "image/*" });
      const url = URL.createObjectURL(blob);
      setCustomBg(url);
      update({ bg: `custom:${url}` });
    } catch {
      // 非 Tauri 环境（浏览器调试）时退回文件选择
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "image/*";
      input.onchange = () => {
        const file = input.files?.[0];
        if (!file) return;
        const url = URL.createObjectURL(file);
        setCustomBg(url);
        update({ bg: `custom:${url}` });
      };
      input.click();
    }
  };

  const bgSrc = useMemo(
    () => (settings.bg.startsWith("custom:") && customBg ? customBg : resolveBackgroundSrc(settings.bg)),
    [settings.bg, customBg],
  );

  // 打印：调用系统打印对话框
  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      {/* 自定义标题栏 */}
      <TitleBar />
      <div className="flex min-h-0 flex-1 flex-col gap-0 lg:flex-row">
      {/* ===== 左侧设置面板 ===== */}
      <aside className="no-print min-h-0 w-full shrink-0 border-b border-stone-200/70 bg-cream-50 p-5 pb-6 lg:w-[20rem] lg:overflow-y-auto lg:border-b-0 lg:border-r dark:border-stone-700/70 dark:bg-stone-900">
        <div className="mb-4 flex items-center gap-2">
          <button
            type="button"
            onClick={regenerate}
            className="flex h-9 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-xl bg-gradient-to-br from-brand-500 to-brand-600 px-3 text-sm font-semibold text-white shadow-md shadow-brand-200 transition-all hover:from-brand-600 hover:to-brand-700 active:scale-[0.98] dark:shadow-brand-950"
            title="按当前设置重新生成题目"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M21 12a9 9 0 1 1-2.64-6.36" />
              <path d="M21 3v6h-6" />
            </svg>
            <span className="truncate">一键换题</span>
          </button>
          <button
            type="button"
            onClick={handlePrint}
            className="flex h-9 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-xl border border-brand-500 px-3 text-sm font-semibold text-brand-600 transition-colors hover:bg-brand-50 dark:text-brand-400 dark:hover:bg-brand-900/30"
            title="打印或导出 PDF"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M6 9V2h12v7" />
              <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
              <rect x="6" y="14" width="12" height="8" rx="1" />
            </svg>
            <span className="truncate">打印/PDF</span>
          </button>
          <button
            type="button"
            onClick={toggleTheme}
            aria-label={theme === "dark" ? "切换到浅色主题" : "切换到深色主题"}
            title={theme === "dark" ? "切换到浅色" : "切换到深色"}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-stone-200 bg-white text-stone-500 shadow-sm transition-colors hover:border-brand-400 hover:text-brand-600 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-400 dark:hover:border-brand-500 dark:hover:text-brand-400"
          >
            {theme === "dark" ? (
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="4" />
                <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
              </svg>
            )}
          </button>
        </div>

        <div className="space-y-2.5">
          <Section icon="🎯" title="题目">
            <NumberField
              label="最大值 N"
              value={settings.n}
              min={3}
              max={50}
              onChange={(v) => update({ n: Number.isFinite(v) ? v : 10 })}
            />
          </Section>

          <Section icon="➗" title="题型分布">
            <NumberField
              label="连加减"
              value={settings.multiRatio}
              min={0}
              max={100}
              step={5}
              onChange={(v) => update({ multiRatio: v })}
            />
            <div className="h-2" />
            <NumberField
              label="括号题"
              value={settings.parenRatio}
              min={0}
              max={100}
              step={5}
              onChange={(v) => update({ parenRatio: v })}
            />
            <div className="h-2" />
            <NumberField
              label="连加减项数"
              value={settings.maxTerms}
              min={2}
              max={4}
              onChange={(v) => update({ maxTerms: v })}
            />
            <div className="h-2" />
            <NumberField
              label="单式加法占比"
              value={settings.addRatio}
              min={0}
              max={100}
              step={5}
              onChange={(v) => update({ addRatio: v })}
            />
          </Section>

          <Section icon="📐" title="布局">
            <NumberField
              label="每行题数"
              value={settings.cols}
              min={2}
              max={10}
              onChange={(v) => update({ cols: Math.min(10, Math.max(2, v) || 5) })}
            />
            <div className="h-2" />
            <NumberField
              label="页数"
              value={settings.pages}
              min={1}
              max={20}
              onChange={(v) => update({ pages: Math.max(1, v || 1) })}
            />
            <div className="h-2" />
            <div className="flex items-center justify-between">
              <span className="text-sm text-stone-600 dark:text-stone-300">题目间隔</span>
              <div className="grid grid-cols-3 gap-0.5 rounded-lg bg-stone-100 p-0.5 dark:bg-stone-800">
                {(Object.keys(SPACING_ROWS) as Spacing[]).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => update({ spacing: s })}
                    className={`rounded-md px-2.5 py-1 text-xs transition-all ${
                      settings.spacing === s
                        ? "bg-white font-semibold text-brand-700 shadow-sm dark:bg-stone-700 dark:text-brand-300"
                        : "text-stone-500 hover:text-stone-700 dark:text-stone-400 dark:hover:text-stone-200"
                    }`}
                  >
                    {SPACING_LABELS[s]}
                  </button>
                ))}
              </div>
            </div>
          </Section>

          <Section icon="✏️" title="卷头信息">
            <input
              className="w-full rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 text-sm text-stone-800 shadow-sm transition-colors focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-200 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100 dark:focus:ring-brand-700"
              placeholder="姓名（留空则隐藏）"
              value={settings.name}
              onChange={(e) => update({ name: e.target.value })}
            />
            <div className="h-2" />
            <input
              type="date"
              className="w-full rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 text-sm text-stone-800 shadow-sm transition-colors focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-200 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100 dark:[color-scheme:dark] dark:focus:ring-brand-700"
              value={settings.date}
              onChange={(e) => update({ date: e.target.value })}
            />
          </Section>

          <Section icon="🎨" title="背景">
            <div className="grid grid-cols-3 gap-1.5">
              {BG_OPTIONS.map((opt) => {
                const src = resolveBackgroundSrc(opt.id);
                const active = settings.bg === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => update({ bg: opt.id })}
                    className={`relative flex h-14 flex-col items-center justify-end overflow-hidden rounded-lg border pb-1 transition-all ${
                      active
                        ? "border-brand-500 ring-2 ring-brand-200 dark:ring-brand-800"
                        : "border-stone-200 hover:border-stone-300 dark:border-stone-700 dark:hover:border-stone-600"
                    }`}
                    title={opt.name}
                  >
                    {src ? (
                      <img
                        src={src}
                        alt={opt.name}
                        className="absolute inset-0 h-full w-full object-cover"
                      />
                    ) : (
                      <span className="absolute inset-0 flex items-center justify-center text-2xl text-stone-300 dark:text-stone-600">
                        □
                      </span>
                    )}
                    <span className="relative z-10 rounded bg-white/85 px-1 text-[10px] text-stone-600">
                      {opt.name}
                    </span>
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              onClick={handleUploadBg}
              className={`mt-2 w-full rounded-lg border py-1.5 text-sm transition-colors ${
                settings.bg.startsWith("custom:")
                  ? "border-brand-500 bg-brand-50 font-medium text-brand-700 dark:border-brand-500 dark:bg-brand-900/50 dark:text-brand-300"
                  : "border-stone-200 text-stone-600 hover:border-stone-300 dark:border-stone-700 dark:text-stone-300 dark:hover:border-stone-600"
              }`}
            >
              {settings.bg.startsWith("custom:") ? "已上传自定义背景 ✓" : "上传自定义背景"}
            </button>
          </Section>
        </div>
      </aside>

      {/* ===== 右侧试卷预览 ===== */}
      <main className="print-area min-h-0 flex-1 overflow-y-auto bg-cream-100 p-5 lg:p-8 dark:bg-stone-950">
        {result.notice && (
          <div className="no-print mb-4 flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-700 dark:border-amber-700/50 dark:bg-amber-950/40 dark:text-amber-300">
            <span>⚠️</span>
            {result.notice}
          </div>
        )}

        <div className="no-print mb-4 flex items-center justify-between gap-3 rounded-xl border border-stone-200/70 bg-white/70 px-4 py-2.5 dark:border-stone-800 dark:bg-stone-900/70">
          <span className="flex items-center gap-1.5 text-sm font-medium text-stone-600 dark:text-stone-300">
            <svg viewBox="0 0 24 24" className="h-4 w-4 text-brand-500" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
              <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
            </svg>
            <span>共 {result.pages.length} 页 · {settings.pages * settings.cols * SPACING_ROWS[settings.spacing]} 题</span>
          </span>
          <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-brand-50 px-3 py-1 text-xs font-medium text-brand-700 dark:bg-brand-900/40 dark:text-brand-300">
            <span className="h-1.5 w-1.5 rounded-full bg-brand-500" />
            背景：{backgroundName(settings.bg)}
          </span>
        </div>

        <div className="space-y-6">
          {result.pages.map((problems, i) => (
            <div key={i} className={i === currentPage ? "" : "page-hidden"}>
              <Sheet
                problems={problems}
                cols={settings.cols}
                spacing={settings.spacing}
                name={settings.name}
                date={settings.date || today()}
                bgSrc={bgSrc}
                pageNo={i + 1}
                totalPages={result.pages.length}
              />
            </div>
          ))}
        </div>

        {/* 翻页控件：首页/上一页 + 页码跳转 + 下一页/末页 */}
        {result.pages.length > 1 && (
          <div className="no-print mt-4 flex flex-col items-center gap-3">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPageIdx(0)}
                disabled={currentPage === 0}
                className="flex h-8 items-center rounded-lg border border-stone-200 bg-white px-2 text-xs text-stone-600 shadow-sm transition-colors hover:border-brand-400 hover:text-brand-600 disabled:cursor-not-allowed disabled:opacity-40 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-300 dark:hover:border-brand-500 dark:hover:text-brand-400"
                title="首页"
                aria-label="首页"
              >
                «
              </button>
              <button
                type="button"
                onClick={() => setPageIdx((i) => Math.max(0, i - 1))}
                disabled={currentPage === 0}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-stone-200 bg-white text-stone-600 shadow-sm transition-colors hover:border-brand-400 hover:text-brand-600 disabled:cursor-not-allowed disabled:opacity-40 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-300 dark:hover:border-brand-500 dark:hover:text-brand-400"
                title="上一页 (←)"
                aria-label="上一页"
              >
                ←
              </button>

              <div className="flex flex-wrap items-center justify-center gap-1.5 px-1">
                {result.pages.map((_, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setPageIdx(i)}
                    className={`h-8 min-w-8 rounded-lg px-2 text-xs font-medium transition-colors ${
                      i === currentPage
                        ? "bg-brand-500 text-white shadow-sm"
                        : "border border-stone-200 bg-white text-stone-500 hover:border-brand-400 hover:text-brand-600 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-400 dark:hover:border-brand-500 dark:hover:text-brand-400"
                    }`}
                    aria-label={`第 ${i + 1} 页`}
                    aria-current={i === currentPage ? "page" : undefined}
                  >
                    {i + 1}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={() =>
                  setPageIdx((i) => Math.min(result.pages.length - 1, i + 1))
                }
                disabled={currentPage === result.pages.length - 1}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-stone-200 bg-white text-stone-600 shadow-sm transition-colors hover:border-brand-400 hover:text-brand-600 disabled:cursor-not-allowed disabled:opacity-40 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-300 dark:hover:border-brand-500 dark:hover:text-brand-400"
                title="下一页 (→)"
                aria-label="下一页"
              >
                →
              </button>
              <button
                type="button"
                onClick={() => setPageIdx(result.pages.length - 1)}
                disabled={currentPage === result.pages.length - 1}
                className="flex h-8 items-center rounded-lg border border-stone-200 bg-white px-2 text-xs text-stone-600 shadow-sm transition-colors hover:border-brand-400 hover:text-brand-600 disabled:cursor-not-allowed disabled:opacity-40 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-300 dark:hover:border-brand-500 dark:hover:text-brand-400"
                title="末页"
                aria-label="末页"
              >
                »
              </button>
            </div>
            <span className="text-xs text-stone-400 dark:text-stone-500">
              共 {result.pages.length} 页 · 键盘 ← → 翻页
            </span>
          </div>
        )}
      </main>
      </div>
    </div>
  );
}

/** 渲染一道题的多项表达式（不含等号和答案横线） */
function ProblemText({ problem }: { problem: Problem }) {
  return (
    <>
      {problem.kind === "s" && (
        <>
          <span>{problem.a}</span>
          <span className="mx-1.5">{problem.op}</span>
          <span>{problem.b}</span>
        </>
      )}
      {problem.kind === "m" && (
        <>
          {problem.nums.map((v, i) => (
            <span key={i} className={(i > 0 ? "flex items-center" : "")}>
              {i > 0 && <span className="mx-1.5">{problem.ops[i - 1]}</span>}
              <span>{v}</span>
            </span>
          ))}
        </>
      )}
      {problem.kind === "p" && (
        <ProblemParen problem={problem} />
      )}
    </>
  );
}

/** 括号题：(n1 o1 n2) o2 n3  或  n1 o1 (n2 o2 n3) */
function ProblemParen({
  problem: { n1, o1, n2, o2, n3, parenAt },
}: {
  problem: Extract<Problem, { kind: "p" }>;
}) {
  if (parenAt === 0) {
    return (
      <>
        <span>(</span>
        <span>{n1}</span>
        <span className="mx-1">{o1}</span>
        <span>{n2}</span>
        <span>)</span>
        <span className="mx-1.5">{o2}</span>
        <span>{n3}</span>
      </>
    );
  }
  return (
    <>
      <span>{n1}</span>
      <span className="mx-1.5">{o1}</span>
      <span>(</span>
      <span>{n2}</span>
      <span className="mx-1">{o2}</span>
      <span>{n3}</span>
      <span>)</span>
    </>
  );
}

/** 单页 A4 试卷 */
function Sheet(props: {
  problems: Problem[];
  cols: number;
  spacing: Spacing;
  name: string;
  date: string;
  bgSrc: string;
  pageNo: number;
  totalPages: number;
}) {
  const { problems, cols, spacing, name, date, bgSrc, pageNo, totalPages } = props;
  return (
    <div className="print-worksheet relative mx-auto aspect-[210/297] w-full max-w-[820px] overflow-hidden rounded-lg bg-white shadow-xl shadow-stone-200/60 ring-1 ring-stone-100 print:shadow-none print:ring-0">
      {bgSrc && (
        <img
          src={bgSrc}
          alt=""
          className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-30"
        />
      )}
      <div className="sheet-inner relative flex h-full flex-col p-8 sm:p-10">
        <div className="mb-6 flex items-end justify-between gap-4 border-b-2 border-stone-300 pb-2">
          {name ? (
            <span className="font-display text-lg text-stone-800">
              姓名：{name}
            </span>
          ) : (
            <span className="font-display text-lg text-stone-700">
              姓名：<span className="write-line min-w-14" />
            </span>
          )}
          {date ? (
            <span className="font-display text-lg text-stone-800">日期：{date}</span>
          ) : (
            <span className="font-display text-lg text-stone-700">
              日期：<span className="write-line min-w-20" />
            </span>
          )}
        </div>
        <div
          className={`grid grid-flow-row flex-1 content-between gap-x-6 ${SPACING_STYLE[spacing].gap}`}
          style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
        >
          {problems.map((p, i) => (
            <div
              key={i}
              className={`problem-cell flex items-center justify-center font-medium text-gray-800 ${SPACING_STYLE[spacing].font}`}
            >
              <ProblemText problem={p} />
              <span className="mx-1.5">=</span>
              <span className="inline-block h-6 w-10 border-b-2 border-gray-500" />
            </div>
          ))}
        </div>
        {totalPages > 1 && (
          <div className="mt-4 text-center text-xs text-gray-400">
            第 {pageNo} 页 / 共 {totalPages} 页
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
