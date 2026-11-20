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


def main():
    print("=" * 64)
    print("  Antigravity Chinese Locale Installer (xhpx7301/agy-chinese)")
    print("=" * 64)

    # 1. Check Node.js
    try:
        res = subprocess.run(["node", "-v"], capture_output=True, text=True)
        if res.returncode != 0:
            print("[Error] Node.js (v18+) is required.")
            sys.exit(1)
        print(f"[✓] Node.js detected: {res.stdout.strip()}")
    except Exception:
        print("[Error] Node.js executable not found in PATH.")
        sys.exit(1)

    # 2. Locate Antigravity resources
    resources_dir = find_antigravity_resources()
    if not resources_dir:
        print("[!] Antigravity installation not detected in standard path.")
        user_in = input("Please input the 'resources' folder path of Antigravity: ").strip()
        if os.path.exists(user_in) and os.path.exists(os.path.join(user_in, "app.asar")):
            resources_dir = user_in
        else:
            print("[Error] Invalid path or app.asar not found.")
            sys.exit(1)

    print(f"[✓] Antigravity resources found: {resources_dir}")
    target_asar = os.path.join(resources_dir, "app.asar")
    backup_asar = os.path.join(resources_dir, "app.asar.bak")

    # 3. Backup original app.asar if not backed up yet
    if not os.path.exists(backup_asar):
        print("[*] Creating initial backup: app.asar.bak ...")
        shutil.copy2(target_asar, backup_asar)
        print("[✓] Backup completed.")
    else:
        print("[✓] Existing backup detected (app.asar.bak).")

    # 4. Validate source files
    script_dir = os.path.dirname(os.path.abspath(__file__))
    repo_root = os.path.dirname(script_dir)
    i18n_runner_src = os.path.join(script_dir, "i18n_runner.js")
    i18n_data_src = os.path.join(script_dir, "i18n_data.json")
    manifest_src = os.path.join(repo_root, "manifest.json")

    for req_file in (i18n_runner_src, i18n_data_src):
        if not os.path.exists(req_file):
            print(f"[Error] Missing required file: {req_file}")
            sys.exit(1)

    with open(i18n_data_src, "r", encoding="utf-8") as f:
        json.load(f)
    chk_runner = subprocess.run(["node", "--check", i18n_runner_src], capture_output=True, text=True)
    if chk_runner.returncode != 0:
        print(f"[Error] Syntax error in i18n_runner.js:\n{chk_runner.stderr}")
        sys.exit(1)

    work_dir = tempfile.mkdtemp(prefix="agy_chinese_work_")
    verify_dir = tempfile.mkdtemp(prefix="agy_chinese_verify_")

    try:
        print("[*] Extracting app.asar into temporary sandbox...")
        subprocess.run(f'npx --yes @electron/asar extract "{target_asar}" "{work_dir}"', shell=True, check=True)

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
            print("[✓] Patched utils.js (hot-cache + GitHub sync)")

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
        print("[✓] Patched main.js")

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
                print("[✓] Patched tray.js")

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
        print("[✓] Patched menu.js")

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
        print("[✓] Patched updater.js")

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
                    print("[✓] Patched ipcHandlers.js")

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
                    print(f"[Error] Pre-pack syntax check failed on {fpath}:\n{chk.stderr}")
                    sys.exit(1)
        print("[✓] Pre-pack syntax checks passed 100%.")

        # 6. Pack into temp asar
        temp_pack = os.path.join(tempfile.gettempdir(), "agy_chinese_new.asar")
        temp_unpacked = temp_pack + ".unpacked"
        if os.path.exists(temp_pack):
            os.remove(temp_pack)
        if os.path.exists(temp_unpacked):
            shutil.rmtree(temp_unpacked)

        print("[*] Packaging modified files into asar...")
        subprocess.run(
            f'npx --yes @electron/asar pack "{work_dir}" "{temp_pack}" --unpack-dir "node_modules/chrome-devtools-mcp"',
            shell=True,
            check=True
        )

        # 7. Post-pack sandbox verification
        print("[*] Verifying packed asar in sandbox...")
        subprocess.run(f'npx --yes @electron/asar extract "{temp_pack}" "{verify_dir}"', shell=True, check=True)
        for rel in ["utils.js", "main.js", "tray.js", "menu.js", "updater.js", "ipcHandlers.js", "i18n_runner.js"]:
            vpath = os.path.join(verify_dir, "dist", rel)
            if os.path.exists(vpath):
                chk = subprocess.run(["node", "--check", vpath], capture_output=True, text=True)
                if chk.returncode != 0:
                    print(f"[Error] Post-pack syntax check failed on {vpath}:\n{chk.stderr}")
                    sys.exit(1)
        print("[✓] Post-pack sandbox verification passed 100%.")

        # 8. Atomic replacement
        target_unpacked = target_asar + ".unpacked"
        if os.path.exists(temp_unpacked):
            if os.path.exists(target_unpacked):
                shutil.rmtree(target_unpacked)
            shutil.copytree(temp_unpacked, target_unpacked)

        shutil.copy2(temp_pack, target_asar)
        print("[✓] Production app.asar updated successfully!")
        print("\n" + "=" * 64)
        print("  汉化部署成功！请彻底退出 Antigravity（含系统托盘）后重新打开。")
        print("=" * 64)

    finally:
        shutil.rmtree(work_dir, ignore_errors=True)
        shutil.rmtree(verify_dir, ignore_errors=True)


if __name__ == "__main__":
    main()
