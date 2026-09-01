/** 内置背景图定义 */
export interface BackgroundItem {
  id: string;
  name: string;
  src: string;
}

export const BUILTIN_BACKGROUNDS: BackgroundItem[] = [
  { id: "bg1", name: "阳光星星", src: "images/bg/bg1.svg" },
  { id: "bg2", name: "彩虹云朵", src: "images/bg/bg2.svg" },
  { id: "bg3", name: "海底小鱼", src: "images/bg/bg3.svg" },
  { id: "bg4", name: "森林蘑菇", src: "images/bg/bg4.svg" },
  { id: "bg5", name: "月亮星空", src: "images/bg/bg5.svg" },
];

/** 背景 id → 展示用 src；custom:xxx 为自定义图片 */
export function resolveBackgroundSrc(bg: string): string {
  if (bg === "none") return "";
  if (bg.startsWith("custom:")) return bg.slice("custom:".length);
  const item = BUILTIN_BACKGROUNDS.find((b) => b.id === bg);
  return item ? item.src : "";
}

export function backgroundName(bg: string): string {
  if (bg === "none") return "无背景";
  if (bg.startsWith("custom:")) return "自定义";
  return BUILTIN_BACKGROUNDS.find((b) => b.id === bg)?.name ?? "无背景";
}
