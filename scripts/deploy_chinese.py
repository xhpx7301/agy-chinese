#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Antigravity Chinese Locale Installer (xhpx7301/agy-chinese)
Google Antigravity 客户端全量汉化与 GitHub 版本比对热同步工具

Features:
- Auto-detects Antigravity resources folder across Windows, macOS & Linux
- Automatic pristine backup (app.asar.bak)
- Full WebContents lifecycle hook (main.js + utils.js)
- Native Electron menus, tray menu, quit dialog, updater & context menus (ipcHandlers.js)
- GitHub auto-sync (https://github.com/xhpx7301/agy-chinese):
  - Checks local Antigravity version against remote manifest.json on startup
  - If versions match and locale_version is newer, downloads latest i18n_data.json & i18n_runner.js to i18n_cache
  - If Antigravity version differs, preserves local localization untouched
- Strict node --check syntax gatekeeper (pre-pack & post-pack sandbox verification)
"""

import argparse
import os
import sys
import shutil
import tempfile
import subprocess
import json

GITHUB_RAW_BASE = "https://raw.githubusercontent.com/xhpx7301/agy-chinese/main"


def find_antigravity_resources():
    local_app_data = os.environ.get("LOCALAPPDATA", "")
    if local_app_data:
        p = os.path.join(local_app_data, "Programs", "antigravity", "resources")
        if os.path.exists(p) and os.path.exists(os.path.join(p, "app.asar")):
            return p
    mac_path = "/Applications/Antigravity.app/Contents/Resources"
    if os.path.exists(mac_path) and os.path.exists(os.path.join(mac_path, "app.asar")):
        return mac_path
    linux_path = "/opt/Antigravity/resources"
    if os.path.exists(linux_path) and os.path.exists(os.path.join(linux_path, "app.asar")):
        return linux_path
    return None


def read_asar_version(asar_dir):
    pkg_path = os.path.join(asar_dir, "package.json")
    if os.path.exists(pkg_path):
        try:
            with open(pkg_path, "r", encoding="utf-8") as f:
                return json.load(f).get("version", "")
        except Exception:
            pass
    return ""


def is_antigravity_running():
    if sys.platform == "win32":
        try:
            res = subprocess.run(
                ["tasklist", "/FI", "IMAGENAME eq Antigravity.exe", "/NH"],
                capture_output=True,
                text=True,
            )
            return "Antigravity.exe" in res.stdout
        except Exception:
            return False
    return False


def get_i18n_cache_dir():
    if sys.platform == "win32":
        appdata = os.environ.get("APPDATA", "")
        if appdata:
            return os.path.join(appdata, "Antigravity", "i18n_cache")
    elif sys.platform == "darwin":
        return os.path.expanduser("~/Library/Application Support/Antigravity/i18n_cache")
    else:
        return os.path.expanduser("~/.config/Antigravity/i18n_cache")
    return ""


def is_asar_localized(target_asar):
    try:
        with open(target_asar, "rb") as f:
            raw = f.read()
        return b"injectAntigravityI18n" in raw and b"syncI18nFromGithub" in raw
    except Exception:
        return False


def launch_antigravity(resources_dir):
    if sys.platform == "win32":
        exe_path = os.path.join(os.path.dirname(resources_dir), "Antigravity.exe")
        if os.path.exists(exe_path):
            import ctypes
            ret = ctypes.windll.shell32.ShellExecuteW(
                None,
                "open",
                exe_path,
                "--remote-debugging-port=0",
                os.path.dirname(exe_path),
                1,
            )
            if ret > 32:
                print(f"[✓] 已启动 Antigravity (已启用 CDP 端口): {exe_path}")
                return True
            os.startfile(exe_path)
            print(f"[✓] 已启动 Antigravity: {exe_path}")
            return True
    elif sys.platform == "darwin":
        subprocess.Popen(["open", "-a", "Antigravity"])
        print("[✓] 已启动 Antigravity。")
        return True
    print("[!] 未找到 Antigravity 可执行文件，请手动打开。")
    return False


def restore_original(resources_dir):
    target_asar = os.path.join(resources_dir, "app.asar")
    backup_asar = os.path.join(resources_dir, "app.asar.bak")
    if not os.path.exists(backup_asar):
        print("[错误] 未找到原版备份 app.asar.bak，无法自动还原。")
        sys.exit(1)
    if is_antigravity_running():
        print("[!] 检测到 Antigravity.exe 仍在运行，还原后请务必彻底退出（含系统托盘）再重开。")
    shutil.copy2(backup_asar, target_asar)
    print("[✓] 已从 app.asar.bak 恢复官方原版 app.asar。")
    cache_dir = get_i18n_cache_dir()
    if cache_dir and os.path.exists(cache_dir):
        shutil.rmtree(cache_dir, ignore_errors=True)
        print(f"[✓] 已清理热同步缓存目录: {cache_dir}")
    print("\n" + "=" * 64)
    print("  已还原为官方英文原版！彻底退出 Antigravity（含托盘）后重开生效。")
    print("=" * 64)


def main():
    parser = argparse.ArgumentParser(description="Antigravity Chinese Locale Installer")
    parser.add_argument("--restore", action="store_true", help="还原官方英文原版 app.asar 并清理缓存")
    parser.add_argument("--check-and-launch", action="store_true", help="检查汉化状态，缺失时自动补全后启动 Antigravity")
    args = parser.parse_args()

    print("=" * 64)
    print("  Antigravity 中文汉化部署工具 (xhpx7301/agy-chinese)")
    print("=" * 64)

    # Locate Antigravity resources
    resources_dir = find_antigravity_resources()
    if not resources_dir:
        print("[!] 未在默认安装路径检测到 Antigravity。")
        user_in = input("请输入 Antigravity 的 resources 目录路径: ").strip()
        if os.path.exists(user_in) and os.path.exists(os.path.join(user_in, "app.asar")):
            resources_dir = user_in
        else:
            print("[错误] 路径无效或未找到 app.asar。")
            sys.exit(1)

    print(f"[✓] 已定位 Antigravity 资源目录: {resources_dir}")
    target_asar = os.path.join(resources_dir, "app.asar")
    backup_asar = os.path.join(resources_dir, "app.asar.bak")

    if args.restore:
        restore_original(resources_dir)
        return

    if args.check_and_launch and is_asar_localized(target_asar):
        print("[✓] 检测到汉化补丁完整（含自动热同步），正在启动 Antigravity...")
        launch_antigravity(resources_dir)
        return

    if args.check_and_launch:
        print("[!] 检测到汉化尚未注入或已被官方更新覆盖，正在自动重新部署汉化...")

    if is_antigravity_running():
        print("[!] 提示：检测到 Antigravity.exe 正在运行，部署完成后请彻底退出（含系统托盘）再重开。")

    # 1. Check Node.js
    try:
        res = subprocess.run(["node", "-v"], capture_output=True, text=True)
        if res.returncode != 0:
            print("[错误] 需要安装 Node.js (v18+)。")
            sys.exit(1)
        print(f"[✓] 已检测到 Node.js: {res.stdout.strip()}")
    except Exception:
        print("[错误] 未在环境变量 PATH 中找到 Node.js。")
        sys.exit(1)

    # 3. Backup original app.asar if not backed up yet
    if not os.path.exists(backup_asar):
        print("[*] 正在创建初始原版备份: app.asar.bak ...")
        shutil.copy2(target_asar, backup_asar)
        print("[✓] 原版备份完成。")
    else:
        print("[✓] 已检测到原版备份 (app.asar.bak)。")

    # 4. Validate source files
    script_dir = os.path.dirname(os.path.abspath(__file__))
    repo_root = os.path.dirname(script_dir)
    i18n_runner_src = os.path.join(script_dir, "i18n_runner.js")
    i18n_data_src = os.path.join(script_dir, "i18n_data.json")
    manifest_src = os.path.join(repo_root, "manifest.json")

    for req_file in (i18n_runner_src, i18n_data_src):
        if not os.path.exists(req_file):
            print(f"[错误] 缺少必需文件: {req_file}")
            sys.exit(1)

    with open(i18n_data_src, "r", encoding="utf-8") as f:
        json.load(f)
    chk_runner = subprocess.run(["node", "--check", i18n_runner_src], capture_output=True, text=True)
    if chk_runner.returncode != 0:
        print(f"[错误] i18n_runner.js 语法校验失败:\n{chk_runner.stderr}")
        sys.exit(1)

    work_dir = tempfile.mkdtemp(prefix="agy_chinese_work_")
    bak_dir = tempfile.mkdtemp(prefix="agy_chinese_bak_")
    verify_dir = tempfile.mkdtemp(prefix="agy_chinese_verify_")

    try:
        print("[*] 正在解包 app.asar 到临时沙箱...")
        subprocess.run(f'npx --yes @electron/asar extract "{target_asar}" "{work_dir}"', shell=True, check=True)
        target_ver = read_asar_version(work_dir)

        utils_js_check = os.path.join(work_dir, "dist", "utils.js")
        need_utils_restore = False
        if os.path.exists(utils_js_check):
            with open(utils_js_check, "r", encoding="utf-8", errors="ignore") as f:
                u_tmp = f.read()
            if "injectAntigravityI18n" in u_tmp and "syncI18nFromGithub" not in u_tmp:
                need_utils_restore = True

        if os.path.exists(backup_asar) and need_utils_restore:
            subprocess.run(f'npx --yes @electron/asar extract-file "{backup_asar}" package.json', shell=True, cwd=bak_dir, check=True)
            bak_ver = read_asar_version(bak_dir)
            if target_ver and bak_ver and target_ver == bak_ver:
                print("[*] 检测到旧版汉化补丁，正在从原版备份恢复 utils.js 以升级热同步模块...")
                subprocess.run(f'npx --yes @electron/asar extract-file "{backup_asar}" dist/utils.js', shell=True, cwd=bak_dir, check=True)
                restored_utils = os.path.join(bak_dir, "utils.js")
                if os.path.exists(restored_utils):
                    shutil.copy2(restored_utils, utils_js_check)
            elif target_ver and bak_ver and target_ver != bak_ver:
                print(f"[*] 检测到客户端已升级 ({bak_ver} -> {target_ver})，正在更新原版备份 app.asar.bak ...")
                shutil.copy2(target_asar, backup_asar)

        dist_dir = os.path.join(work_dir, "dist")
        os.makedirs(dist_dir, exist_ok=True)
        shutil.copy2(i18n_runner_src, os.path.join(dist_dir, "i18n_runner.js"))
        shutil.copy2(i18n_data_src, os.path.join(dist_dir, "i18n_data.json"))
        if os.path.exists(manifest_src):
            shutil.copy2(manifest_src, os.path.join(dist_dir, "i18n_manifest.json"))

        # A. Patch utils.js (hot-cache aware loader + GitHub version-matched sync)
        utils_js = os.path.join(dist_dir, "utils.js")
        with open(utils_js, "r", encoding="utf-8") as f:
            u_content = f.read()

        if "injectAntigravityI18n" not in u_content:
            inject_fn = (
                "\nconst getI18nCacheDir = () => {\n"
                "    try { return path_1.default.join(electron_1.app.getPath('userData'), 'i18n_cache'); } catch (_e) { return ''; }\n"
                "};\n"
                "const readI18nAsset = (fileName) => {\n"
                "    const cacheDir = getI18nCacheDir();\n"
                "    if (cacheDir) {\n"
                "        const cached = path_1.default.join(cacheDir, fileName);\n"
                "        if (fs.existsSync(cached)) return fs.readFileSync(cached, 'utf-8');\n"
                "    }\n"
                "    const bundled = path_1.default.join(__dirname, fileName);\n"
                "    return fs.existsSync(bundled) ? fs.readFileSync(bundled, 'utf-8') : null;\n"
                "};\n"
                "const injectAntigravityI18n = (target) => {\n"
                "    try {\n"
                "        const wc = target && target.webContents ? target.webContents : target;\n"
                "        if (!wc || typeof wc.executeJavaScript !== 'function' || wc.isDestroyed()) return;\n"
                "        const dataStr = readI18nAsset('i18n_data.json');\n"
                "        const runnerCode = readI18nAsset('i18n_runner.js');\n"
                "        if (dataStr && runnerCode) {\n"
                "            const script = '(function(){try{window.__ANTIGRAVITY_I18N_DATA__=' + JSON.stringify(JSON.parse(dataStr)) + ';' + runnerCode + '}catch(e){console.error(\"[Antigravity i18n] Error:\",e);}})();';\n"
                "            wc.executeJavaScript(script).catch(() => {});\n"
                "        }\n"
                "    } catch (e) {\n"
                "        console.error('[Antigravity i18n] Injection error:', e);\n"
                "    }\n"
                "};\n"
                "exports.injectAntigravityI18n = injectAntigravityI18n;\n"
                "const getLocalAntigravityVersion = () => {\n"
                "    try {\n"
                "        const verFile = path_1.default.join(path_1.default.dirname(process.execPath), 'version');\n"
                "        if (fs.existsSync(verFile)) return fs.readFileSync(verFile, 'utf-8').trim();\n"
                "    } catch (_e) {}\n"
                "    try { return electron_1.app.getVersion(); } catch (_e) { return ''; }\n"
                "};\n"
                "const syncI18nFromGithub = async () => {\n"
                "    try {\n"
                "        if (typeof fetch !== 'function') return;\n"
                "        const rawBase = '" + GITHUB_RAW_BASE + "';\n"
                "        const localVer = getLocalAntigravityVersion();\n"
                "        if (!localVer) return;\n"
                "        const res = await fetch(rawBase + '/manifest.json', { signal: AbortSignal.timeout(4000) });\n"
                "        if (!res.ok) return;\n"
                "        const remoteManifest = await res.json();\n"
                "        if (!remoteManifest || remoteManifest.antigravity_version !== localVer) {\n"
                "            console.log('[Antigravity i18n] Version mismatch (local=' + localVer + ', remote=' + (remoteManifest && remoteManifest.antigravity_version) + '), keeping local localization.');\n"
                "            return;\n"
                "        }\n"
                "        const cacheDir = getI18nCacheDir();\n"
                "        if (!cacheDir) return;\n"
                "        let localLocaleVer = '';\n"
                "        const cachedManifest = path_1.default.join(cacheDir, 'manifest.json');\n"
                "        const bundledManifest = path_1.default.join(__dirname, 'i18n_manifest.json');\n"
                "        const mPath = fs.existsSync(cachedManifest) ? cachedManifest : (fs.existsSync(bundledManifest) ? bundledManifest : '');\n"
                "        if (mPath) {\n"
                "            try { localLocaleVer = JSON.parse(fs.readFileSync(mPath, 'utf-8')).locale_version || ''; } catch (_e) {}\n"
                "        }\n"
                "        if (remoteManifest.locale_version && remoteManifest.locale_version === localLocaleVer) return;\n"
                "        const dataPathRel = (remoteManifest.files && remoteManifest.files.data) || 'scripts/i18n_data.json';\n"
                "        const runnerPathRel = (remoteManifest.files && remoteManifest.files.runner) || 'scripts/i18n_runner.js';\n"
                "        const [dRes, rRes] = await Promise.all([\n"
                "            fetch(rawBase + '/' + dataPathRel, { signal: AbortSignal.timeout(6000) }),\n"
                "            fetch(rawBase + '/' + runnerPathRel, { signal: AbortSignal.timeout(6000) })\n"
                "        ]);\n"
                "        if (!dRes.ok || !rRes.ok) return;\n"
                "        const [dText, rText] = await Promise.all([dRes.text(), rRes.text()]);\n"
                "        JSON.parse(dText);\n"
                "        if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });\n"
                "        fs.writeFileSync(path_1.default.join(cacheDir, 'i18n_data.json'), dText, 'utf-8');\n"
                "        fs.writeFileSync(path_1.default.join(cacheDir, 'i18n_runner.js'), rText, 'utf-8');\n"
                "        fs.writeFileSync(cachedManifest, JSON.stringify(remoteManifest, null, 2), 'utf-8');\n"
                "        console.log('[Antigravity i18n] Synced locale_version ' + remoteManifest.locale_version + ' from GitHub.');\n"
                "        for (const win of getHubWindows()) {\n"
                "            const wc = getHubWebContents(win);\n"
                "            if (wc) injectAntigravityI18n(wc);\n"
                "        }\n"
                "    } catch (_e) {}\n"
                "};\n"
                "exports.syncI18nFromGithub = syncI18nFromGithub;\n"
            )
            u_content = u_content + inject_fn
            hub_needle = "    const hubContents = getHubWebContents(win);\n    if (!hubContents) {\n        throw new Error('Failed to initialize Hub WebContents');\n    }"
            if hub_needle in u_content:
                u_content = u_content.replace(
                    hub_needle,
                    hub_needle + "\n    hubContents.on('dom-ready', () => injectAntigravityI18n(hubContents));\n    hubContents.on('did-finish-load', () => injectAntigravityI18n(hubContents));\n    hubContents.on('did-navigate-in-page', () => injectAntigravityI18n(hubContents));",
                    1
                )
            show_needle = "wins[0].focus();"
            if show_needle in u_content:
                u_content = u_content.replace(
                    show_needle,
                    show_needle + "\n        if (exports.injectAntigravityI18n) { (0, exports.injectAntigravityI18n)(wins[0]); }",
                    1
                )
            with open(utils_js, "w", encoding="utf-8") as f:
                f.write(u_content)
            print("[✓] 已修补 utils.js（本地热缓存 + GitHub 自动同步）")

        # B. Patch main.js (global web-contents-created hook, tray labels, quit dialog, GitHub sync trigger)
        main_js = os.path.join(dist_dir, "main.js")
        with open(main_js, "r", encoding="utf-8") as f:
            m_content = f.read()

        if "injectAntigravityI18n" not in m_content:
            m_needle = "(0, guestPromptController_1.configureSessionPromptPreload)(contents.session);"
            m_inject = (
                m_needle + "\n"
                "    if (contents.getType() !== 'webview') {\n"
                "        contents.on('dom-ready', () => { if (utils_1.injectAntigravityI18n) (0, utils_1.injectAntigravityI18n)(contents); });\n"
                "        contents.on('did-finish-load', () => { if (utils_1.injectAntigravityI18n) (0, utils_1.injectAntigravityI18n)(contents); });\n"
                "        contents.on('did-navigate-in-page', () => { if (utils_1.injectAntigravityI18n) (0, utils_1.injectAntigravityI18n)(contents); });\n"
                "    }"
            )
            if m_needle in m_content:
                m_content = m_content.replace(m_needle, m_inject, 1)

        if "syncI18nFromGithub" not in m_content:
            ready_needle = "    Object.assign(console, main_1.default.functions);"
            if ready_needle in m_content:
                m_content = m_content.replace(
                    ready_needle,
                    ready_needle + "\n    setTimeout(() => { if (utils_1.syncI18nFromGithub) void (0, utils_1.syncI18nFromGithub)(); }, 3000);",
                    1
                )

        main_replacements = [
            ("label: 'No agents running',", "label: '暂无运行中的智能体',"),
            ("label: `Open ${electron_1.app.getName()}`,", "label: `打开 ${electron_1.app.getName()}`,") ,
            ("label: 'Quit',", "label: '退出',"),
            ("buttons: ['Cancel', 'Quit'],", "buttons: ['取消', '退出'],"),
            ("title: 'Confirm Quit',", "title: '确认退出',"),
            ("message: 'Are you sure you want to quit?',", "message: '确定要退出吗？',"),
            ("detail: 'There may be agents or background tasks running.',", "detail: '当前可能有智能体或后台任务正在运行。',"),
        ]
        for old, new in main_replacements:
            m_content = m_content.replace(old, new)

        with open(main_js, "w", encoding="utf-8") as f:
            f.write(m_content)
        print("[✓] 已修补 main.js（全局窗口注入 + 托盘/退出弹窗汉化）")

        # C. Patch tray.js
        tray_js = os.path.join(dist_dir, "tray.js")
        if os.path.exists(tray_js):
            with open(tray_js, "r", encoding="utf-8") as f:
                tray_content = f.read()
            old_count_expr = (
                "(count > 0 ? `${count}` : 'No') +\n"
                "                    ' agent' +\n"
                "                    (count === 1 ? '' : 's') +\n"
                "                    ' running';"
            )
            new_count_expr = "count > 0 ? `${count} 个智能体运行中` : '暂无运行中的智能体';"
            if old_count_expr in tray_content:
                tray_content = tray_content.replace(old_count_expr, new_count_expr, 1)
                with open(tray_js, "w", encoding="utf-8") as f:
                    f.write(tray_content)
                print("[✓] 已修补 tray.js（系统托盘动态智能体计数）")

        # D. Patch menu.js
        menu_js = os.path.join(dist_dir, "menu.js")
        with open(menu_js, "r", encoding="utf-8") as f:
            menu_content = f.read()
        menu_replacements = [
            ("label: 'New Window',", "label: '新建窗口',"),
            ("label: 'Docs',", "label: '文档',"),
            ("return { label: 'Connect to WSL', submenu };", "return { label: '连接到 WSL', submenu };"),
            ("return { label: 'Reopen Locally',", "return { label: '在本地重新打开',"),
            ("label: item.label || 'Actual Size',", "label: '实际大小',"),
            ("label: item.label || 'Zoom In',", "label: '放大',"),
            ("label: 'Zoom In',", "label: '放大',"),
            ("label: item.label || 'Zoom Out',", "label: '缩小',"),
        ]
        for old, new in menu_replacements:
            menu_content = menu_content.replace(old, new)
        with open(menu_js, "w", encoding="utf-8") as f:
            f.write(menu_content)
        print("[✓] 已修补 menu.js（原生应用菜单）")

        # E. Patch updater.js
        updater_js = os.path.join(dist_dir, "updater.js")
        with open(updater_js, "r", encoding="utf-8") as f:
            upd_content = f.read()
        upd_replacements = [
            ('MenuUpdateStep["CheckForUpdates"] = "Check for Updates";', 'MenuUpdateStep["CheckForUpdates"] = "检查更新";'),
            ('MenuUpdateStep["CheckingForUpdates"] = "Checking for Updates...";', 'MenuUpdateStep["CheckingForUpdates"] = "正在检查更新...";'),
            ('MenuUpdateStep["RestartToUpdate"] = "Restart to Update";', 'MenuUpdateStep["RestartToUpdate"] = "重启以更新";'),
            ("title: 'Check for Updates',", "title: '检查更新',"),
            ("message: 'No updates available',", "message: '暂无可用更新',"),
        ]
        for old, new in upd_replacements:
            upd_content = upd_content.replace(old, new)
        with open(updater_js, "w", encoding="utf-8") as f:
            f.write(upd_content)
        print("[✓] 已修补 updater.js（检查更新菜单与弹窗）")

        # F. Patch ipcHandlers.js (native context menus with hot-cache support)
        ipc_js = os.path.join(dist_dir, "ipcHandlers.js")
        if os.path.exists(ipc_js):
            with open(ipc_js, "r", encoding="utf-8") as f:
                ipc_content = f.read()
            if "translateContextMenuLabel" not in ipc_content:
                ipc_helper = (
                    "let __agI18nCache = null;\n"
                    "let __agI18nMtime = 0;\n"
                    "function translateContextMenuLabel(label) {\n"
                    "    if (typeof label !== 'string' || !label) return label ?? '';\n"
                    "    try {\n"
                    "        const pathMod = require('path');\n"
                    "        const fsMod = require('fs');\n"
                    "        let dataPath = pathMod.join(__dirname, 'i18n_data.json');\n"
                    "        try {\n"
                    "            const cached = pathMod.join(electron_1.app.getPath('userData'), 'i18n_cache', 'i18n_data.json');\n"
                    "            if (fsMod.existsSync(cached)) dataPath = cached;\n"
                    "        } catch (_e) {}\n"
                    "        if (fsMod.existsSync(dataPath)) {\n"
                    "            const mtime = fsMod.statSync(dataPath).mtimeMs;\n"
                    "            if (!__agI18nCache || mtime !== __agI18nMtime) {\n"
                    "                __agI18nCache = JSON.parse(fsMod.readFileSync(dataPath, 'utf-8'));\n"
                    "                __agI18nMtime = mtime;\n"
                    "            }\n"
                    "        }\n"
                    "        const exact = (__agI18nCache && __agI18nCache.exact) || {};\n"
                    "        const trimmed = label.trim();\n"
                    "        if (exact[trimmed]) return exact[trimmed];\n"
                    "        const rules = (__agI18nCache && __agI18nCache.regex_rules) || [];\n"
                    "        for (let i = 0; i < rules.length; i++) {\n"
                    "            const re = new RegExp(rules[i].pattern);\n"
                    "            if (re.test(trimmed)) return trimmed.replace(re, rules[i].replacement);\n"
                    "        }\n"
                    "    } catch (_e) {}\n"
                    "    return label;\n"
                    "}\n"
                    "function buildContextMenuTemplate(items, onSelect) {"
                )
                ipc_needle = "function buildContextMenuTemplate(items, onSelect) {"
                if ipc_needle in ipc_content:
                    ipc_content = ipc_content.replace(ipc_needle, ipc_helper, 1)
                    ipc_content = ipc_content.replace("label: item.label ?? '',", "label: translateContextMenuLabel(item.label ?? ''),")
                    with open(ipc_js, "w", encoding="utf-8") as f:
                        f.write(ipc_content)
                    print("[✓] 已修补 ipcHandlers.js（原生右键菜单汉化）")

        # 5. Pre-pack syntax gatekeeper
        check_targets = [
            os.path.join(dist_dir, "utils.js"),
            os.path.join(dist_dir, "main.js"),
            os.path.join(dist_dir, "tray.js"),
            os.path.join(dist_dir, "menu.js"),
            os.path.join(dist_dir, "updater.js"),
            os.path.join(dist_dir, "ipcHandlers.js"),
            os.path.join(dist_dir, "i18n_runner.js"),
        ]
        for fpath in check_targets:
            if os.path.exists(fpath):
                chk = subprocess.run(["node", "--check", fpath], capture_output=True, text=True)
                if chk.returncode != 0:
                    print(f"[错误] 打包前语法校验失败 {fpath}:\n{chk.stderr}")
                    sys.exit(1)
        print("[✓] 打包前语法门禁校验 100% 通过。")

        # 6. Pack into temp asar
        temp_pack = os.path.join(tempfile.gettempdir(), "agy_chinese_new.asar")
        temp_unpacked = temp_pack + ".unpacked"
        if os.path.exists(temp_pack):
            os.remove(temp_pack)
        if os.path.exists(temp_unpacked):
            shutil.rmtree(temp_unpacked)

        print("[*] 正在重新打包 app.asar ...")
        subprocess.run(
            f'npx --yes @electron/asar pack "{work_dir}" "{temp_pack}" --unpack-dir "node_modules/chrome-devtools-mcp"',
            shell=True,
            check=True
        )

        # 7. Post-pack sandbox verification
        print("[*] 正在沙箱中解包验证打包产物...")
        subprocess.run(f'npx --yes @electron/asar extract "{temp_pack}" "{verify_dir}"', shell=True, check=True)
        for rel in ["utils.js", "main.js", "tray.js", "menu.js", "updater.js", "ipcHandlers.js", "i18n_runner.js"]:
            vpath = os.path.join(verify_dir, "dist", rel)
            if os.path.exists(vpath):
                chk = subprocess.run(["node", "--check", vpath], capture_output=True, text=True)
                if chk.returncode != 0:
                    print(f"[错误] 打包后沙箱校验失败 {vpath}:\n{chk.stderr}")
                    sys.exit(1)
        print("[✓] 打包后沙箱校验 100% 通过。")

        # 8. Atomic replacement
        target_unpacked = target_asar + ".unpacked"
        if os.path.exists(temp_unpacked):
            if os.path.exists(target_unpacked):
                shutil.rmtree(target_unpacked)
            shutil.copytree(temp_unpacked, target_unpacked)

        shutil.copy2(temp_pack, target_asar)
        print("[✓] 生产环境 app.asar 替换成功！")
        if args.check_and_launch:
            launch_antigravity(resources_dir)
        else:
            print("\n" + "=" * 64)
            print("  汉化部署成功！请彻底退出 Antigravity（含系统托盘）后重新打开。")
            print("=" * 64)

    finally:
        shutil.rmtree(work_dir, ignore_errors=True)
        if bak_dir:
            shutil.rmtree(bak_dir, ignore_errors=True)
        shutil.rmtree(verify_dir, ignore_errors=True)


if __name__ == "__main__":
    main()
