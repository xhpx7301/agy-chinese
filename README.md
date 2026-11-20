# agy-chinese

Google Antigravity 桌面端深度汉化包与自动同步工程方案（基于 [renkeshui/antigravity-chinese-locale](https://github.com/renkeshui/antigravity-chinese-locale) 深度定制与扩展）。

## 特性

- **全量词库覆盖**：内置 **1,320+ 条**精确词条、**44 条**动态正则规则（支持额度刷新倒计时中文单位、模型标签等）以及 **43 条**受控组件反向映射（`reverse_map`），避免 Base UI / Radix 下拉框选中卡死。
- **全生命周期与原生界面覆盖**：
  - 覆盖主窗口、弹窗、SPA 路由切换、Shadow DOM 以及交互防抖扫描（`click` / `contextmenu` / `mousedown` / `keyup` / `focusin`）。
  - 覆盖 Electron 原生应用菜单（`menu.js`）、系统托盘菜单与动态智能体计数（`tray.js`）、退出确认框、更新提示（`updater.js`）以及全部原生右键菜单（`ipcHandlers.js`）。
- **GitHub 版本比对与自动热同步**：
  - 客户端每次启动后异步检查本仓库 `manifest.json`：
  - 若本地 Antigravity 版本与仓库 `antigravity_version` 一致，且 `locale_version` 有更新，自动下载最新 `i18n_data.json` 与 `i18n_runner.js` 至本地缓存目录（`%APPDATA%\Antigravity\i18n_cache`）并热重载生效（含原生右键菜单）。
  - 若 Antigravity 版本与仓库不一致，则保留本地原有汉化设置，避免版本错配。
- **严格门禁校验**：所有脚本在打包前与沙箱解包后均执行 `node --check` 静态语法检查。

## 使用方法

### 方式一：一键安装（Windows）
1. 确保已安装 **Node.js (v18+)** 和 **Python (3.8+)**。
2. 双击运行根目录下的 `一键汉化.bat`，或执行：
   ```bash
   python scripts/deploy_chinese.py
   ```
3. **彻底退出 Antigravity**（右键任务栏右下角系统托盘图标选择退出），再重新打开即可生效。

### 方式二：作为 Antigravity Skill 使用
将 `skills/Chinesizing` 复制到全局技能目录：
- Windows: `%USERPROFILE%\.gemini\config\skills\Chinesizing\`（及 `%USERPROFILE%\.gemini\antigravity\skills\Chinesizing\`）
- macOS / Linux: `~/.gemini/config/skills/Chinesizing/`

## 注意事项
- 当 Antigravity 客户端自身升级版本时，官方更新会覆盖 `app.asar`，此时重新运行一次 `一键汉化.bat` 或 `python scripts/deploy_chinese.py` 即可重新启用汉化与自动同步。
- 本项目遵循 [MIT License](LICENSE)。
