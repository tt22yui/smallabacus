# 小算盘 · SmallAbacus

**10 以内加减法试卷生成器** —— 一键生成并打印小学数学口算试卷的桌面应用。

基于 **Tauri v2**（Rust 后端 + React/TypeScript 前端 + Tailwind CSS）。

## ✨ 功能特性

- **灵活题目范围**：N 以内任意调节（默认 10），支持 3~50。
- **自定义题型分布**：加法/减法占比滑块调节（10%~90%）。
- **灵活的排版布局**：每行题数、每页行数、总页数自由设置，实时预览。
- **智能出题引擎**：
  - 加法池 `a+b ≤ N`、减法池 `a ≥ b` 且结果非负；
  - 卷内题目不重复、相邻题目不重复；
  - 题量超出组合上限时自动降级处理并给出提示。
- **卷头信息**：姓名、日期（留空自动填当天）。
- **多样背景**：内置多套背景，也支持上传自定义图片作为卷面水印底图。
- **一键换题**：重新洗牌生成新卷面。
- **打印 / 导出 PDF**：调用系统打印对话框，可按 A4 输出。
- **设置自动记忆**：偏好存在本地，重启后保留。

## 🚀 开发

### 环境要求

- [Node.js](https://nodejs.org/)（LTS）
- [Rust](https://www.rust-lang.org/tools/install)（stable）
- 系统依赖：Windows 需 WebView2；macOS 需 Xcode 命令行工具；Linux 需 `webkit2gtk-4.1` 等（参见 [Tauri 官方文档](https://tauri.app/start/prerequisites/)）。

### 安装与运行

```bash
npm install       # 安装前端依赖
npm run tauri dev # 启动开发模式（热更新 + 调试窗口）
```

### 构建

```bash
npm run tauri build # 打包桌面应用（Windows .msi/.exe，macOS .dmg/.app）
```

## 🤖 自动构建与发布（GitHub Actions）

仓库已配置 [build.yml](.github/workflows/build.yml)：

- 仅在打 tag（`v*`，如 `v0.1.0`）时触发构建；
- Windows 与 macOS 并行构建，产物自动上传到对应 tag 的 **草稿 Release**；
- 草稿需在 GitHub Releases 页面手动确认发布。

发版流程：

```bash
git tag v0.1.0
git push origin v0.1.0
```

构建完成后到 [Releases](https://github.com/tt22yui/smallabacus/releases) 审核并发布草稿版本。

## 📁 项目结构

```
├── src/                 # 前端（React + TypeScript）
│   ├── App.tsx          # 主界面：设置面板 + 试卷预览
│   ├── generator.ts     # 出题引擎（随机、不重复、题型占比）
│   ├── backgrounds.ts   # 内置背景
│   └── types.ts         # 类型与默认设置
├── src-tauri/           # Tauri 后端（Rust）
│   ├── src/             # Rust 入口
│   ├── icons/           # 各平台图标
│   ├── tauri.conf.json  # 应用与打包配置
│   └── Cargo.toml
├── .github/workflows/   # GitHub Actions 自动构建
└── package.json
```

## 📄 License

本项目基于 [MIT License](LICENSE) 开源。版权所有 © SmallAbacus。