# AI Agent 自动化安装与运维指南 (`agy-chinese`)

> 本文档面向 AI 编码助手（Antigravity / Claude Code / Codex / Cursor），用于在单个回合内完成 `agy-chinese` 的状态诊断、部署、校验、无改包 CDP 挂载或一键还原。

## 1. 环境前置要求
- **Python**: `>= 3.8`
- **Node.js**: `>= 18.0.0`（推荐 `v22+`）

## 2. 常用命令（直接执行）

### 检查当前汉化与缓存状态
```bash
python scripts/deploy_chinese.py --status
```

### 静态门禁校验（不修改客户端文件）
校验 `manifest.json`、`scripts/custom_overrides.json`、`scripts/i18n_data.json`、正则合法性、`reverse_map` 一致性，以及 `node --check` 语法检查：
```bash
python scripts/deploy_chinese.py --check
```

### 标准全量部署（改写 `app.asar` + 主进程原生菜单/托盘/右键 + GitHub 热同步）
```bash
python scripts/deploy_chinese.py
```
> 注意：部署完成后需彻底退出 Antigravity（含系统托盘）再重开，或直接执行带 `--check-and-launch` 的启动模式：
```bash
python scripts/deploy_chinese.py --check-and-launch
```

### 零改包 CDP 注入模式（适合 macOS 保签名或临时热更新测试）
需先确保 Antigravity 以 `--remote-debugging-port=0` 启动（Windows 可使用根目录 `启动Antigravity(自动检查汉化).bat`）：
```bash
node scripts/cdp_inject.mjs          # 单次向活跃窗口注入最新词库与执行器
node scripts/cdp_inject.mjs --watch  # 持续监听新窗口与页面导航
node scripts/cdp_inject.mjs --lang en     # 实时切回英文原版
node scripts/cdp_inject.mjs --lang zh-CN  # 实时切回简体中文
node scripts/cdp_inject.mjs --dump-untranslated  # 探测当前界面漏翻的英文词条
```

### 配置/还原桌面防失效快捷方式（Windows，无黑框静默自检启动）
```bash
python scripts/deploy_chinese.py --install-shortcut
python scripts/deploy_chinese.py --restore-shortcut
```

### 一键安装 / 卸载 Obsidian Prism 光学 UI 美化套件（可选，GPL-3.0）
```bash
python scripts/install_obsidian_prism.py
python scripts/install_obsidian_prism.py --status
python scripts/install_obsidian_prism.py --uninstall
```

### 还原官方英文原版
```bash
python scripts/deploy_chinese.py --restore
```

## 3. 客户端内可视化、思考翻译与快捷键
汉化激活后，可在 **设置 → 外观（Settings → Appearance）** 页面底部直接：
- 点击 **界面语言（简体中文 | English）** 开关，或按下 **`Alt + Shift + L`** 实时切换中/英文（无需重启）；
- 按需开启 **思考过程双模翻译**（支持免配置机翻与本地 Ollama / OpenAI 兼容模型润色，默认关闭且支持仅展开时翻译）；
- 启用 **长代码块手动折叠（≥48 行）** 与 **`Alt + ↑ / ↓` 对话轮次快速跳转**。
