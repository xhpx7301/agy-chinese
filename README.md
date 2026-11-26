# agy-chinese

Google Antigravity 桌面端深度汉化包与自动同步工程方案（基于 [renkeshui/antigravity-chinese-locale](https://github.com/renkeshui/antigravity-chinese-locale) 深度定制与扩展）。

## 特性

- **全量词库覆盖**：内置 **5,457+ 条**精确词条、**73 条**动态正则规则（支持额度刷新倒计时中文单位、模型标签等）以及 **43 条**受控组件反向映射（`reverse_map`），避免 Base UI / Radix 下拉框选中卡死。
- **全生命周期与原生界面覆盖**：
  - 覆盖主窗口、弹窗、SPA 路由切换、Shadow DOM 以及交互防抖扫描（`click` / `contextmenu` / `mousedown` / `keyup` / `focusin`）。
  - 覆盖 Electron 原生应用菜单（`menu.js`）、系统托盘菜单与动态智能体计数（`tray.js`）、退出确认框、更新提示（`updater.js`）以及全部原生右键菜单（`ipcHandlers.js`）。
- **免重启实时中英切换与内容区隔离**：
  - 基于 `WeakMap` 记录已翻译节点与属性的原始英文文本，在 **设置 → 外观（Settings → Appearance）** 页面底部嵌入可视化 **界面语言切换开关（简体中文 | English）**，也可按 **`Alt + Shift + L`** 随时一键实时切换（支持跨窗口同步）。
  - 严格跳过代码编辑器（Monaco / CodeMirror）、集成终端（xterm）、代码块及可编辑区域，并兼容社区免翻译标记（`translate="no"` / `data-no-translate` / `data-ag-localization-skip`）。
- **轻量双模式思维翻译与工作台增强（零常驻进程 / 零动效卡顿）**：
  - 通过主进程轻量 IPC 桥接（`thought_ipc.js` + `preload.js`，自动继承系统代理），在 **设置 → 外观** 中可开启 **思考过程双模翻译**（免配置机翻 / OpenAI 兼容接口 AI 润色，支持 **双语对照 / 沉浸中文** 及 **仅展开时翻译** 省流模式）。
  - 内置零性能开销的工作台小工具：长代码块手动折叠（`≥48` 行）与 **`Alt + ↑ / ↓`** 对话轮次快速跳转。
- **双模式注入（全量 `app.asar` + 零改包 CDP）**：
  - 默认采用 `app.asar` 全量部署 + GitHub 热同步；同时提供零依赖的 `scripts/cdp_inject.mjs`（支持 `--watch` 守护及 `--dump-untranslated` 漏翻词条探测），适合 macOS 保签名或临时免改包调试。
- **GitHub 版本比对与自动热同步**：
  - 客户端每次启动后异步检查本仓库 `manifest.json`：
  - 若本地 Antigravity 版本与仓库 `antigravity_version` 一致，且 `locale_version` 有更新，自动下载最新 `i18n_data.json` 与 `i18n_runner.js` 至本地缓存目录（`%APPDATA%\Antigravity\i18n_cache`）并热重载生效（含原生右键菜单）。
  - 若 Antigravity 版本与仓库不一致，则保留本地原有汉化设置，避免版本错配。
- **严格门禁校验**：所有脚本在打包前与沙箱解包后均执行 `node --check` 静态语法检查。

## 使用方法

### 方式一：一键安装与日常启动（Windows）
1. 确保已安装 **Node.js (v18+)** 和 **Python (3.8+)**。
2. 双击运行根目录下的 `一键汉化.bat`，或执行：
   ```bash
   python scripts/deploy_chinese.py
   ```
3. **彻底退出 Antigravity**（右键任务栏右下角系统托盘图标选择退出），再重新打开即可生效。
4. **日常防失效启动**：可直接双击 `启动Antigravity(自动检查汉化).bat` 启动客户端；或双击 `一键配置桌面防失效快捷方式.bat`（也可执行 `python scripts/deploy_chinese.py --install-shortcut`）将桌面/开始菜单快捷方式升级为无黑框静默自检启动，官方更新覆盖后点桌面图标也会自动先补打汉化再拉起客户端（自动附加 `--remote-debugging-port=0`）。
5. **一键安装额度查看插件（可选）**：双击 `一键安装agy-capsule额度插件.bat` 可从官方仓库 [Lumidarin/agy-capsule](https://github.com/Lumidarin/agy-capsule) 自动安装插件并修复桌面/开始菜单/任务栏快捷方式的 CDP 参数。
6. **一键安装光学 UI 美化套件（可选）**：双击 `一键安装obsidian-prism美化套件.bat`（或执行 `python scripts/install_obsidian_prism.py`）可从官方仓库 [RMvdesi/obsidian-prism](https://github.com/RMvdesi/obsidian-prism)（GPL-3.0 协议）实时拉取并部署光学主题、512K 玻璃瓶、思维翻译与桌面像素宠物，自动保留 `agy-chinese` 防失效快捷方式（支持 `--status` / `--uninstall`）。注：其自带额度面板与 `agy-capsule` 功能有重叠，建议按需二选一；切勿执行其 `clean:legacy`，以免清除 `app.asar` 汉化。
7. **客户端内实时切换中/英文**：在 **设置 → 外观** 页面底部点击 **界面语言（简体中文 | English）** 开关，或在任意 Antigravity 窗口按下 **`Alt + Shift + L`** 即可免重启实时切换。
8. **状态检查与静态校验**：
   ```bash
   python scripts/deploy_chinese.py --status
   python scripts/deploy_chinese.py --check
   ```
9. **零改包 CDP 模式（可选，适合 macOS 保签名或热调试）**：
   ```bash
   node scripts/cdp_inject.mjs --watch
   node scripts/cdp_inject.mjs --dump-untranslated
   ```
10. **还原官方英文**：如需恢复官方原版，双击 `一键还原官方英文.bat`（或执行 `python scripts/deploy_chinese.py --restore`）。
11. **AI 助手一键接入**：可参考 [AI_INSTALL.md](AI_INSTALL.md)。

### 方式二：作为 Antigravity Skill 使用
将 `skills/Chinesizing` 复制到全局技能目录：
- Windows: `%USERPROFILE%\.gemini\config\skills\Chinesizing\`（及 `%USERPROFILE%\.gemini\antigravity\skills\Chinesizing\`）
- macOS / Linux: `~/.gemini/config/skills/Chinesizing/`

## 注意事项
- 当 Antigravity 客户端自身升级版本时，官方更新会覆盖 `app.asar`，此时重新运行一次 `一键汉化.bat` 或 `python scripts/deploy_chinese.py` 即可重新启用汉化与自动同步。
- 本项目遵循 [MIT License](LICENSE)。
