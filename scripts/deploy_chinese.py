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
import re
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
        return (
            b"injectAntigravityI18n" in raw
            and b"syncI18nFromGithub" in raw
            and b"agyChineseBridge" in raw
        )
    except Exception:
        return False


def launch_antigravity(resources_dir):
    if sys.platform == "win32":
        exe_path = os.path.join(os.path.dirname(resources_dir), "Antigravity.exe")
        if os.path.exists(exe_path):
            # 以完全脱离控制台的方式启动：Electron 会附着到父进程控制台并打印
            # 日志（DevTools/AutoUpdater/libpng 等），且会让批处理窗口无法自动关闭。
            DETACHED_PROCESS = 0x00000008
            CREATE_NEW_PROCESS_GROUP = 0x00000200
            CREATE_BREAKAWAY_FROM_JOB = 0x01000000
            try:
                subprocess.Popen(
                    [exe_path, "--remote-debugging-port=0", "--disable-logging", "--log-level=3"],
                    cwd=os.path.dirname(exe_path),
                    stdin=subprocess.DEVNULL,
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                    close_fds=True,
                    creationflags=DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP | CREATE_BREAKAWAY_FROM_JOB,
                )
                print(f"[✓] 已启动 Antigravity (后台独立运行): {exe_path}")
                return True
            except Exception:
                try:
                    subprocess.Popen(
                        [exe_path, "--remote-debugging-port=0"],
                        cwd=os.path.dirname(exe_path),
                        stdin=subprocess.DEVNULL,
                        stdout=subprocess.DEVNULL,
                        stderr=subprocess.DEVNULL,
                        close_fds=True,
                        creationflags=DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP,
                    )
                    print(f"[✓] 已启动 Antigravity: {exe_path}")
                    return True
                except Exception:
                    os.startfile(exe_path)
                    print(f"[✓] 已启动 Antigravity: {exe_path}")
                    return True
    elif sys.platform == "darwin":
        subprocess.Popen(["open", "-a", "Antigravity"])
        print("[✓] 已启动 Antigravity。")
        return True
    print("[!] 未找到 Antigravity 可执行文件，请手动打开。")
    return False


def get_shortcut_backup_path():
    appdata = os.environ.get("APPDATA", "")
    if appdata:
        return os.path.join(appdata, "Antigravity", "agy_chinese_shortcut_backup.json")
    return ""


def find_pythonw_exe():
    candidates = []
    if sys.executable:
        candidates.append(os.path.join(os.path.dirname(sys.executable), "pythonw.exe"))
    which_pyw = shutil.which("pythonw")
    if which_pyw:
        candidates.append(which_pyw)
    local_app = os.environ.get("LOCALAPPDATA", "")
    if local_app:
        py_root = os.path.join(local_app, "Programs", "Python")
        if os.path.isdir(py_root):
            try:
                for entry in sorted(os.listdir(py_root), reverse=True):
                    candidates.append(os.path.join(py_root, entry, "pythonw.exe"))
            except Exception:
                pass
    for cand in candidates:
        if cand and os.path.isfile(cand):
            return cand
    return ""


def install_shortcuts(resources_dir):
    if sys.platform != "win32":
        print("[!] 自动快捷方式配置仅支持 Windows。")
        return
    exe_path = os.path.join(os.path.dirname(resources_dir), "Antigravity.exe")
    if not os.path.exists(exe_path):
        print(f"[错误] 未找到 Antigravity.exe: {exe_path}")
        sys.exit(1)

    script_dir = os.path.dirname(os.path.abspath(__file__))
    repo_root = os.path.dirname(script_dir)
    deploy_script = os.path.abspath(__file__)
    pythonw_exe = find_pythonw_exe()
    vbs_path = os.path.join(script_dir, "silent_launch.vbs")

    if pythonw_exe:
        target_launcher = pythonw_exe
        target_args = f'"{deploy_script}" --check-and-launch --silent'
        launcher_mode = f"pythonw.exe 无窗直启（免 VBS 防杀软误报）"
    else:
        if not os.path.exists(vbs_path):
            print(f"[错误] 未找到 pythonw.exe 且缺少静默启动脚本: {vbs_path}")
            sys.exit(1)
        target_launcher = os.path.join(os.environ.get("SystemRoot", r"C:\Windows"), "System32", "wscript.exe")
        target_args = f'"{vbs_path}"'
        launcher_mode = "wscript.exe + silent_launch.vbs（回退模式）"

    backup_path = get_shortcut_backup_path()
    ps_script = r"""
$ErrorActionPreference = 'Stop'
$exePath = $env:AGY_EXE_PATH
$targetLauncher = $env:AGY_TARGET_LAUNCHER
$targetArgs = $env:AGY_TARGET_ARGS
$repoRoot = $env:AGY_REPO_ROOT
$backupPath = $env:AGY_BACKUP_PATH

$dirs = @(
  [Environment]::GetFolderPath('Desktop'),
  [Environment]::GetFolderPath('CommonDesktopDirectory'),
  [Environment]::GetFolderPath('StartMenu'),
  [Environment]::GetFolderPath('CommonStartMenu'),
  (Join-Path $env:APPDATA 'Microsoft\Internet Explorer\Quick Launch\User Pinned\TaskBar')
) | Where-Object { $_ -and (Test-Path -LiteralPath $_) } | Select-Object -Unique

$existing = @{}
if ($backupPath -and (Test-Path -LiteralPath $backupPath)) {
  try {
    $raw = Get-Content -LiteralPath $backupPath -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($raw) {
      foreach ($p in $raw.PSObject.Properties) {
        $existing[$p.Name] = $p.Value
      }
    }
  } catch {}
}

$shell = New-Object -ComObject WScript.Shell
$updated = 0
$found = 0

foreach ($d in $dirs) {
  Get-ChildItem -LiteralPath $d -Recurse -Filter *.lnk -ErrorAction SilentlyContinue | ForEach-Object {
    $lnkPath = $_.FullName
    try {
      $sc = $shell.CreateShortcut($lnkPath)
      $leaf = if ($sc.TargetPath) { Split-Path -Leaf $sc.TargetPath } else { '' }
      $isOrig = ($leaf -ieq 'Antigravity.exe')
      $isOurs = (($leaf -ieq 'wscript.exe' -and $sc.Arguments -like "*silent_launch.vbs*") -or ($leaf -ieq 'pythonw.exe' -and $sc.Arguments -like "*deploy_chinese.py*"))
      if ($isOrig -or $isOurs) {
        $found++
        if ($isOrig -and -not $existing.ContainsKey($lnkPath)) {
          $existing[$lnkPath] = @{
            TargetPath = [string]$sc.TargetPath
            Arguments = [string]$sc.Arguments
            WorkingDirectory = [string]$sc.WorkingDirectory
            IconLocation = [string]$sc.IconLocation
          }
        }
        $sc.TargetPath = $targetLauncher
        $sc.Arguments = $targetArgs
        $sc.WorkingDirectory = $repoRoot
        $sc.IconLocation = "$exePath,0"
        $sc.Save()
        $updated++
      }
    } catch {}
  }
}

if ($found -eq 0) {
  $desktopLnk = Join-Path ([Environment]::GetFolderPath('Desktop')) 'Antigravity.lnk'
  $sc = $shell.CreateShortcut($desktopLnk)
  $sc.TargetPath = $targetLauncher
  $sc.Arguments = $targetArgs
  $sc.WorkingDirectory = $repoRoot
  $sc.IconLocation = "$exePath,0"
  $sc.Save()
  $updated = 1
}

if ($backupPath) {
  $parent = Split-Path -Parent $backupPath
  if (-not (Test-Path -LiteralPath $parent)) { New-Item -ItemType Directory -Path $parent -Force | Out-Null }
  $existing | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $backupPath -Encoding UTF8
}
Write-Output "$found,$updated"
"""
    env = os.environ.copy()
    env["AGY_EXE_PATH"] = exe_path
    env["AGY_TARGET_LAUNCHER"] = target_launcher
    env["AGY_TARGET_ARGS"] = target_args
    env["AGY_REPO_ROOT"] = repo_root
    env["AGY_BACKUP_PATH"] = backup_path

    res = subprocess.run(
        ["powershell.exe", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", ps_script],
        env=env,
        capture_output=True,
        text=True,
        check=True,
    )
    line = res.stdout.strip().splitlines()[-1] if res.stdout.strip() else "0,0"
    found, updated = line.split(",")
    print(f"[✓] 防失效快捷方式配置完成（{launcher_mode}）：匹配原有快捷方式 {found} 个，已更新/创建 {updated} 个。")
    print("    现在通过桌面/开始菜单打开 Antigravity 时，会自动静默检查并修复汉化！")


def restore_shortcuts(silent=False):
    if sys.platform != "win32":
        return
    backup_path = get_shortcut_backup_path()
    if not backup_path or not os.path.exists(backup_path):
        if not silent:
            print("[*] 未找到快捷方式备份记录，无需还原快捷方式。")
        return

    ps_script = r"""
$ErrorActionPreference = 'SilentlyContinue'
$backupPath = $env:AGY_BACKUP_PATH
$raw = Get-Content -LiteralPath $backupPath -Raw -Encoding UTF8 | ConvertFrom-Json
$shell = New-Object -ComObject WScript.Shell
$restored = 0
if ($raw) {
  foreach ($p in $raw.PSObject.Properties) {
    $lnkPath = $p.Name
    $info = $p.Value
    if ((Test-Path -LiteralPath $lnkPath) -and $info.TargetPath) {
      $sc = $shell.CreateShortcut($lnkPath)
      $sc.TargetPath = [string]$info.TargetPath
      $sc.Arguments = [string]$info.Arguments
      $sc.WorkingDirectory = [string]$info.WorkingDirectory
      if ($info.IconLocation) { $sc.IconLocation = [string]$info.IconLocation }
      $sc.Save()
      $restored++
    }
  }
}
Remove-Item -LiteralPath $backupPath -Force -ErrorAction SilentlyContinue
Write-Output "$restored"
"""
    env = os.environ.copy()
    env["AGY_BACKUP_PATH"] = backup_path
    res = subprocess.run(
        ["powershell.exe", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", ps_script],
        env=env,
        capture_output=True,
        text=True,
    )
    if res.returncode == 0:
        cnt = res.stdout.strip().splitlines()[-1] if res.stdout.strip() else "0"
        print(f"[✓] 已还原 {cnt} 个桌面/开始菜单快捷方式为官方原版。")


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
    restore_shortcuts(silent=True)
    cache_dir = get_i18n_cache_dir()
    if cache_dir and os.path.exists(cache_dir):
        shutil.rmtree(cache_dir, ignore_errors=True)
        print(f"[✓] 已清理热同步缓存目录: {cache_dir}")
    print("\n" + "=" * 64)
    print("  已还原为官方英文原版！彻底退出 Antigravity（含托盘）后重开生效。")
    print("=" * 64)


def read_installed_app_version(resources_dir):
    ver_file = os.path.join(os.path.dirname(resources_dir), "version")
    if os.path.exists(ver_file):
        try:
            with open(ver_file, "r", encoding="utf-8") as f:
                return f.read().strip()
        except Exception:
            pass
    return ""


def print_status():
    print("=" * 64)
    print("  Antigravity 中文汉化状态检查 (agy-chinese)")
    print("=" * 64)
    resources_dir = find_antigravity_resources()
    if not resources_dir:
        print("[!] 未在默认安装路径检测到 Antigravity。")
    else:
        target_asar = os.path.join(resources_dir, "app.asar")
        backup_asar = os.path.join(resources_dir, "app.asar.bak")
        app_ver = read_installed_app_version(resources_dir) or "未知"
        localized = is_asar_localized(target_asar)
        print(f"[*] 资源目录        : {resources_dir}")
        print(f"[*] 客户端版本      : {app_ver}")
        print(f"[*] app.asar 汉化   : {'已注入 (含自动热同步)' if localized else '未注入 / 原版'}")
        print(f"[*] 原版备份 (.bak) : {'存在' if os.path.exists(backup_asar) else '不存在'}")
        print(f"[*] 客户端运行状态  : {'运行中' if is_antigravity_running() else '未运行'}")

    cache_dir = get_i18n_cache_dir()
    if cache_dir and os.path.exists(cache_dir):
        cached_manifest = os.path.join(cache_dir, "manifest.json")
        cached_ver = "无 manifest"
        if os.path.exists(cached_manifest):
            try:
                with open(cached_manifest, "r", encoding="utf-8") as f:
                    cached_ver = json.load(f).get("locale_version", "未知")
            except Exception:
                cached_ver = "读取失败"
        print(f"[*] 热同步缓存目录  : {cache_dir} (locale_version={cached_ver})")
    else:
        print(f"[*] 热同步缓存目录  : 未创建 ({cache_dir or '未知'})")


def run_repo_check():
    print("=" * 64)
    print("  agy-chinese 仓库静态门禁与词库一致性校验")
    print("=" * 64)
    script_dir = os.path.dirname(os.path.abspath(__file__))
    repo_root = os.path.dirname(script_dir)

    json_targets = [
        os.path.join(repo_root, "manifest.json"),
        os.path.join(script_dir, "custom_overrides.json"),
        os.path.join(script_dir, "i18n_data.json"),
    ]
    loaded = {}
    for jp in json_targets:
        if not os.path.exists(jp):
            print(f"[错误] 缺少文件: {jp}")
            sys.exit(1)
        with open(jp, "r", encoding="utf-8") as f:
            loaded[os.path.basename(jp)] = json.load(f)
        print(f"[✓] JSON 合法性通过: {os.path.relpath(jp, repo_root)}")

    i18n_data = loaded["i18n_data.json"]
    exact = i18n_data.get("exact", {})
    rev_map = i18n_data.get("reverse_map", {})
    regex_rules = i18n_data.get("regex_rules", [])
    for idx, rule in enumerate(regex_rules):
        try:
            re.compile(rule["pattern"])
        except Exception as exc:
            print(f"[错误] regex_rules[{idx}] 正则无效: {rule.get('pattern')} ({exc})")
            sys.exit(1)
    for zh, en in rev_map.items():
        if exact.get(en) and exact.get(en) != zh:
            print(f"[!] reverse_map 提示: '{zh}' -> '{en}' 与 exact['{en}']='{exact.get(en)}' 不一致")
    print(f"[✓] 词库校验通过: exact={len(exact)}, reverse_map={len(rev_map)}, regex_rules={len(regex_rules)}")

    js_targets = [
        os.path.join(script_dir, "i18n_runner.js"),
        os.path.join(script_dir, "thought_ipc.js"),
        os.path.join(script_dir, "cdp_inject.mjs"),
    ]
    for jsp in js_targets:
        if os.path.exists(jsp):
            chk = subprocess.run(["node", "--check", jsp], capture_output=True, text=True)
            if chk.returncode != 0:
                print(f"[错误] 语法校验失败 {jsp}:\n{chk.stderr}")
                sys.exit(1)
            print(f"[✓] JS 语法门禁通过: {os.path.relpath(jsp, repo_root)}")
    print("[✓] 全部校验通过。")


def main():
    parser = argparse.ArgumentParser(description="Antigravity Chinese Locale Installer")
    parser.add_argument("--restore", action="store_true", help="还原官方英文原版 app.asar 并清理缓存")
    parser.add_argument("--check-and-launch", action="store_true", help="检查汉化状态，缺失时自动补全后启动 Antigravity")
    parser.add_argument("--install-shortcut", action="store_true", help="将桌面/开始菜单 Antigravity 快捷方式替换为静默防失效启动器")
    parser.add_argument("--restore-shortcut", action="store_true", help="将快捷方式还原为官方 Antigravity.exe")
    parser.add_argument("--silent", action="store_true", help="静默非交互模式（供快捷方式调用）")
    parser.add_argument("--status", action="store_true", help="查看当前 Antigravity 汉化与热缓存状态")
    parser.add_argument("--check", action="store_true", help="校验仓库 JSON 词库、正则与 JS 语法（不改写客户端）")
    args = parser.parse_args()

    if args.check:
        run_repo_check()
        return

    if args.status:
        print_status()
        return

    if args.restore_shortcut:
        restore_shortcuts(silent=False)
        return

    print("=" * 64)
    print("  Antigravity 中文汉化部署工具 (xhpx7301/agy-chinese)")
    print("=" * 64)

    # Locate Antigravity resources
    resources_dir = find_antigravity_resources()
    if not resources_dir:
        print("[!] 未在默认安装路径检测到 Antigravity。")
        if args.silent:
            sys.exit(1)
        user_in = input("请输入 Antigravity 的 resources 目录路径: ").strip()
        if os.path.exists(user_in) and os.path.exists(os.path.join(user_in, "app.asar")):
            resources_dir = user_in
        else:
            print("[错误] 路径无效或未找到 app.asar。")
            sys.exit(1)

    print(f"[✓] 已定位 Antigravity 资源目录: {resources_dir}")
    target_asar = os.path.join(resources_dir, "app.asar")
    backup_asar = os.path.join(resources_dir, "app.asar.bak")

    if args.install_shortcut:
        install_shortcuts(resources_dir)
        return

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
    thought_ipc_src = os.path.join(script_dir, "thought_ipc.js")
    manifest_src = os.path.join(repo_root, "manifest.json")

    for req_file in (i18n_runner_src, i18n_data_src, thought_ipc_src):
        if not os.path.exists(req_file):
            print(f"[错误] 缺少必需文件: {req_file}")
            sys.exit(1)

    with open(i18n_data_src, "r", encoding="utf-8") as f:
        json.load(f)
    for chk_target in (i18n_runner_src, thought_ipc_src):
        chk_runner = subprocess.run(["node", "--check", chk_target], capture_output=True, text=True)
        if chk_runner.returncode != 0:
            print(f"[错误] {os.path.basename(chk_target)} 语法校验失败:\n{chk_runner.stderr}")
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
        if (os.path.exists(utils_js_check)):
            with open(utils_js_check, "r", encoding="utf-8", errors="ignore") as f:
                u_tmp = f.read()
            if "injectAntigravityI18n" in u_tmp and ("syncI18nFromGithub" not in u_tmp or "remoteManifest.antigravity_version !== localVer" in u_tmp or "loadCustomI18nMap" not in u_tmp):
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
        shutil.copy2(thought_ipc_src, os.path.join(dist_dir, "thought_ipc.js"))
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
                "const loadCustomI18nMap = () => {\n"
                "    const out = {};\n"
                "    const cacheDir = getI18nCacheDir();\n"
                "    if (!cacheDir) return out;\n"
                "    for (const name of ['custom_i18n.json', 'custom-i18n.json']) {\n"
                "        try {\n"
                "            const fp = path_1.default.join(cacheDir, name);\n"
                "            if (!fs.existsSync(fp)) continue;\n"
                "            const st = fs.statSync(fp);\n"
                "            if (!st.isFile() || st.size <= 0 || st.size > 512 * 1024) continue;\n"
                "            const parsed = JSON.parse(fs.readFileSync(fp, 'utf-8'));\n"
                "            let count = 0;\n"
                "            if (Array.isArray(parsed)) {\n"
                "                for (const item of parsed) {\n"
                "                    if (count >= 2000) break;\n"
                "                    if (Array.isArray(item) && typeof item[0] === 'string' && typeof item[1] === 'string') {\n"
                "                        const k = item[0].trim(), v = item[1].trim();\n"
                "                        if (k && v && k.length <= 400 && v.length <= 400) { out[k] = v; count++; }\n"
                "                    }\n"
                "                }\n"
                "            } else if (parsed && typeof parsed === 'object') {\n"
                "                const src = parsed.exact && typeof parsed.exact === 'object' ? parsed.exact : parsed;\n"
                "                for (const [rawK, rawV] of Object.entries(src)) {\n"
                "                    if (count >= 2000) break;\n"
                "                    if (typeof rawV !== 'string') continue;\n"
                "                    const k = rawK.trim(), v = rawV.trim();\n"
                "                    if (k && v && k.length <= 400 && v.length <= 400) { out[k] = v; count++; }\n"
                "                }\n"
                "            }\n"
                "        } catch (_e) {}\n"
                "    }\n"
                "    return out;\n"
                "};\n"
                "const injectAntigravityI18n = (target) => {\n"
                "    try {\n"
                "        const wc = target && target.webContents ? target.webContents : target;\n"
                "        if (!wc || typeof wc.executeJavaScript !== 'function' || wc.isDestroyed()) return;\n"
                "        const dataStr = readI18nAsset('i18n_data.json');\n"
                "        const runnerCode = readI18nAsset('i18n_runner.js');\n"
                "        if (dataStr && runnerCode) {\n"
                "            const dataObj = JSON.parse(dataStr);\n"
                "            const customMap = loadCustomI18nMap();\n"
                "            if (customMap && Object.keys(customMap).length > 0) {\n"
                "                dataObj.exact = Object.assign({}, dataObj.exact || {}, customMap);\n"
                "            }\n"
                "            const script = '(function(){try{window.__ANTIGRAVITY_I18N_DATA__=' + JSON.stringify(dataObj) + ';' + runnerCode + '}catch(e){console.error(\"[Antigravity i18n] Error:\",e);}})();';\n"
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
                "        if (!remoteManifest || !remoteManifest.locale_version) return;\n"
                "        const cacheDir = getI18nCacheDir();\n"
                "        if (!cacheDir) return;\n"
                "        let localLocaleVer = '';\n"
                "        const cachedManifest = path_1.default.join(cacheDir, 'manifest.json');\n"
                "        const bundledManifest = path_1.default.join(__dirname, 'i18n_manifest.json');\n"
                "        const mPath = fs.existsSync(cachedManifest) ? cachedManifest : (fs.existsSync(bundledManifest) ? bundledManifest : '');\n"
                "        if (mPath) {\n"
                "            try { localLocaleVer = JSON.parse(fs.readFileSync(mPath, 'utf-8')).locale_version || ''; } catch (_e) {}\n"
                "        }\n"
                "        if (remoteManifest.locale_version === localLocaleVer) return;\n"
                "        const dataPathRel = (remoteManifest.files && remoteManifest.files.data) || 'scripts/i18n_data.json';\n"
                "        const runnerPathRel = (remoteManifest.files && remoteManifest.files.runner) || 'scripts/i18n_runner.js';\n"
                "        const [dRes, rRes] = await Promise.all([\n"
                "            fetch(rawBase + '/' + dataPathRel, { signal: AbortSignal.timeout(6000) }),\n"
                "            fetch(rawBase + '/' + runnerPathRel, { signal: AbortSignal.timeout(6000) })\n"
                "        ]);\n"
                "        if (!dRes.ok || !rRes.ok) return;\n"
                "        const [dText, rText] = await Promise.all([dRes.text(), rRes.text()]);\n"
                "        JSON.parse(dText);\n"
                "        new Function(rText);\n"
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

        # F. Patch ipcHandlers.js (native context menus with hot-cache support + thought translator IPC)
        ipc_js = os.path.join(dist_dir, "ipcHandlers.js")
        if os.path.exists(ipc_js):
            with open(ipc_js, "r", encoding="utf-8") as f:
                ipc_content = f.read()
            ipc_changed = False
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
                    ipc_changed = True
            if "registerThoughtIpc" not in ipc_content:
                reg_needle = "function registerIpcHandlers(storageManager, deps = {}) {"
                if reg_needle in ipc_content:
                    ipc_content = ipc_content.replace(
                        reg_needle,
                        reg_needle + "\n    try { require('./thought_ipc.js').registerThoughtIpc(electron_1); } catch (_e) {}",
                        1,
                    )
                    ipc_changed = True
            if ipc_changed:
                with open(ipc_js, "w", encoding="utf-8") as f:
                    f.write(ipc_content)
                print("[✓] 已修补 ipcHandlers.js（原生右键菜单汉化 + 思考翻译 IPC）")

        # G. Patch preload.js (expose agyChineseBridge for thought translator)
        preload_js = os.path.join(dist_dir, "preload.js")
        if os.path.exists(preload_js):
            with open(preload_js, "r", encoding="utf-8") as f:
                p_content = f.read()
            if "agyChineseBridge" not in p_content:
                p_needle = "electron_1.contextBridge.exposeInMainWorld('extensions', extensionsAPI);"
                if p_needle in p_content:
                    bridge_code = (
                        p_needle + "\n"
                        "electron_1.contextBridge.exposeInMainWorld('agyChineseBridge', {\n"
                        "    getThoughtConfig: () => electron_1.ipcRenderer.invoke('agy-chinese:get-thought-config'),\n"
                        "    saveThoughtConfig: (cfg) => electron_1.ipcRenderer.invoke('agy-chinese:save-thought-config', cfg),\n"
                        "    testThoughtConfig: (cfg) => electron_1.ipcRenderer.invoke('agy-chinese:test-thought-config', cfg),\n"
                        "    translateThought: (payload) => electron_1.ipcRenderer.invoke('agy-chinese:translate-thought', payload),\n"
                        "});"
                    )
                    p_content = p_content.replace(p_needle, bridge_code, 1)
                    with open(preload_js, "w", encoding="utf-8") as f:
                        f.write(p_content)
                    print("[✓] 已修补 preload.js（挂载 agyChineseBridge）")

        # 5. Pre-pack syntax gatekeeper
        check_targets = [
            os.path.join(dist_dir, "utils.js"),
            os.path.join(dist_dir, "main.js"),
            os.path.join(dist_dir, "tray.js"),
            os.path.join(dist_dir, "menu.js"),
            os.path.join(dist_dir, "updater.js"),
            os.path.join(dist_dir, "ipcHandlers.js"),
            os.path.join(dist_dir, "preload.js"),
            os.path.join(dist_dir, "thought_ipc.js"),
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
        for rel in ["utils.js", "main.js", "tray.js", "menu.js", "updater.js", "ipcHandlers.js", "preload.js", "thought_ipc.js", "i18n_runner.js"]:
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
