#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
One-click installer & manager for RMvdesi/obsidian-prism (GPL-3.0).
从官方仓库 https://github.com/RMvdesi/obsidian-prism 实时拉取并部署光学 UI 与思维套件，
并与 agy-chinese 的防失效快捷方式、app.asar 汉化补丁安全共存。
"""

import argparse
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import urllib.request
import zipfile

PRISM_REPO_URL = "https://github.com/RMvdesi/obsidian-prism.git"
PRISM_ZIP_URL = "https://github.com/RMvdesi/obsidian-prism/archive/refs/heads/main.zip"
PRISM_RELEASES_API = "https://api.github.com/repos/RMvdesi/obsidian-prism/releases/latest"


def get_node_major_version():
    try:
        res = subprocess.run(["node", "-v"], capture_output=True, text=True)
        if res.returncode == 0:
            m = re.match(r"^v?(\d+)\.", res.stdout.strip())
            if m:
                return int(m.group(1))
    except Exception:
        pass
    return 0


def get_cache_repo_dir():
    if sys.platform == "win32":
        base = os.environ.get("LOCALAPPDATA") or os.path.expanduser("~")
        return os.path.join(base, "agy-chinese", "obsidian-prism")
    return os.path.join(os.path.expanduser("~"), ".cache", "agy-chinese", "obsidian-prism")


def get_plugin_target_dir():
    return os.path.join(os.path.expanduser("~"), ".gemini", "config", "plugins", "obsidian-prism")


def has_agy_chinese_shortcuts():
    if sys.platform != "win32":
        return False
    appdata = os.environ.get("APPDATA", "")
    if not appdata:
        return False
    return os.path.exists(os.path.join(appdata, "Antigravity", "agy_chinese_shortcut_backup.json"))


def sync_source_repo(repo_dir):
    parent = os.path.dirname(repo_dir)
    os.makedirs(parent, exist_ok=True)
    has_git = False
    try:
        has_git = subprocess.run(["git", "--version"], capture_output=True, text=True).returncode == 0
    except Exception:
        has_git = False

    if has_git:
        if os.path.exists(os.path.join(repo_dir, ".git")):
            print(f"[*] 正在更新本地 obsidian-prism 源码缓存: {repo_dir}")
            res = subprocess.run(["git", "-C", repo_dir, "pull", "--ff-only"], capture_output=True, text=True)
            if res.returncode == 0:
                print("[✓] 源码缓存已更新。")
                return repo_dir
            print("[!] git pull 未能快进，尝试重新克隆最新源码...")
            shutil.rmtree(repo_dir, ignore_errors=True)
        print("[*] 正在从 GitHub 克隆官方 RMvdesi/obsidian-prism ...")
        subprocess.run(["git", "clone", "--depth", "1", PRISM_REPO_URL, repo_dir], check=True)
        return repo_dir

    # Fallback: download ZIP archive when git is unavailable
    work_dir = tempfile.mkdtemp(prefix="obsidian_prism_zip_")
    try:
        zip_path = os.path.join(work_dir, "obsidian-prism.zip")
        print("[*] 正在从 GitHub 下载官方 RMvdesi/obsidian-prism 压缩包...")
        req = urllib.request.Request(PRISM_ZIP_URL, headers={"User-Agent": "agy-chinese/1.0"})
        with urllib.request.urlopen(req, timeout=30) as resp, open(zip_path, "wb") as out:
            shutil.copyfileobj(resp, out)
        with zipfile.ZipFile(zip_path, "r") as zf:
            zf.extractall(work_dir)
        extracted = os.path.join(work_dir, "obsidian-prism-main")
        if not os.path.exists(extracted):
            raise RuntimeError("解压后的目录结构异常，未找到 obsidian-prism-main。")
        if os.path.exists(repo_dir):
            shutil.rmtree(repo_dir, ignore_errors=True)
        shutil.copytree(extracted, repo_dir)
        return repo_dir
    finally:
        shutil.rmtree(work_dir, ignore_errors=True)


def install_via_release_exe():
    print("[*] 当前 Node.js 版本低于 v22 或未安装，改用官方 Windows 安装器...")
    plugin_dir = get_plugin_target_dir()
    if os.path.exists(plugin_dir):
        print(f"[!] 检测到已存在插件目录: {plugin_dir}")
        print("    注意：官方 obsidian-prism-installer.exe 再次运行可能触发卸载切换。")
        print("    如需无损更新，建议升级到 Node.js >= 22 后重新运行本脚本。")
        sys.exit(1)

    req = urllib.request.Request(PRISM_RELEASES_API, headers={"User-Agent": "agy-chinese/1.0"})
    with urllib.request.urlopen(req, timeout=20) as resp:
        rel = json.loads(resp.read().decode("utf-8"))

    assets = {a["name"]: a["browser_download_url"] for a in rel.get("assets", [])}
    exe_url = assets.get("obsidian-prism-installer.exe")
    sums_url = assets.get("SHA256SUMS.txt")
    if not exe_url:
        raise RuntimeError("未在最新 Release 中找到 obsidian-prism-installer.exe。")

    expected_sha256 = None
    if sums_url:
        s_req = urllib.request.Request(sums_url, headers={"User-Agent": "agy-chinese/1.0"})
        with urllib.request.urlopen(s_req, timeout=15) as s_resp:
            for line in s_resp.read().decode("utf-8", errors="ignore").splitlines():
                parts = line.strip().split()
                if len(parts) >= 2 and parts[-1].endswith("obsidian-prism-installer.exe"):
                    expected_sha256 = parts[0].lower()
                    break

    work_dir = tempfile.mkdtemp(prefix="obsidian_prism_exe_")
    try:
        exe_path = os.path.join(work_dir, "obsidian-prism-installer.exe")
        print(f"[*] 正在下载官方安装器 ({rel.get('tag_name', 'latest')})...")
        d_req = urllib.request.Request(exe_url, headers={"User-Agent": "agy-chinese/1.0"})
        with urllib.request.urlopen(d_req, timeout=60) as d_resp, open(exe_path, "wb") as out:
            shutil.copyfileobj(d_resp, out)

        if expected_sha256:
            h = hashlib.sha256()
            with open(exe_path, "rb") as f:
                for chunk in iter(lambda: f.read(65536), b""):
                    h.update(chunk)
            actual = h.hexdigest().lower()
            if actual != expected_sha256:
                raise RuntimeError(f"SHA256 校验失败: expected={expected_sha256}, actual={actual}")
            print("[✓] 官方安装器 SHA256 校验通过。")

        print("[*] 正在运行官方安装器...")
        subprocess.run([exe_path], check=True)
    finally:
        shutil.rmtree(work_dir, ignore_errors=True)


def cleanup_plugin_dir_best_effort(plugin_dir):
    if not os.path.exists(plugin_dir):
        return True
    shutil.rmtree(plugin_dir, ignore_errors=True)
    return not os.path.exists(plugin_dir)


def run_plugin_script(repo_dir, action, allow_fail=False):
    installer_js = os.path.join(repo_dir, "tools", "install-plugin.cjs")
    if not os.path.exists(installer_js):
        raise RuntimeError(f"未找到安装脚本: {installer_js}")
    cmd = ["node", installer_js, f"--{action}"]
    if action in ("install", "uninstall") and has_agy_chinese_shortcuts():
        cmd.append("--no-shortcuts")
        print("[*] 检测到 agy-chinese 防失效快捷方式，已保留现有快捷方式不被覆盖。")
    res = subprocess.run(cmd, cwd=repo_dir, capture_output=allow_fail, text=True)
    if res.returncode != 0 and not allow_fail:
        raise subprocess.CalledProcessError(res.returncode, cmd)
    return res


def main():
    parser = argparse.ArgumentParser(description="Obsidian Prism Installer for agy-chinese")
    parser.add_argument("--uninstall", action="store_true", help="卸载 obsidian-prism 插件与守护进程")
    parser.add_argument("--status", action="store_true", help="查看 obsidian-prism 安装状态")
    args = parser.parse_args()

    print("=" * 64)
    print("  Obsidian Prism (黑曜棱镜) 一键安装与共存管理工具")
    print("  官方仓库: https://github.com/RMvdesi/obsidian-prism (GPL-3.0)")
    print("=" * 64)

    node_major = get_node_major_version()
    repo_dir = get_cache_repo_dir()

    if args.status:
        plugin_dir = get_plugin_target_dir()
        print(f"[*] 插件目录: {plugin_dir} ({'已安装' if os.path.exists(plugin_dir) else '未安装'})")
        if node_major >= 22 and os.path.exists(os.path.join(repo_dir, "tools", "install-plugin.cjs")):
            run_plugin_script(repo_dir, "status")
        return

    if args.uninstall:
        if node_major < 22:
            print("[错误] 源码卸载需要 Node.js >= 22.0.0。")
            sys.exit(1)
        if not os.path.exists(os.path.join(repo_dir, "tools", "install-plugin.cjs")):
            sync_source_repo(repo_dir)
        res = run_plugin_script(repo_dir, "uninstall", allow_fail=True)
        if res.stdout:
            print(res.stdout.strip())
        plugin_dir = get_plugin_target_dir()
        fully_removed = cleanup_plugin_dir_best_effort(plugin_dir)
        if res.returncode != 0 and not fully_removed:
            print("[!] 注意：Antigravity 仍在运行，部分插件目录文件被系统句柄锁定（EBUSY），插件注册与后台守护已停用。")
            print("    彻底退出 Antigravity（含托盘）后重开即生效；重开后如需彻底清空残留目录，可再执行一次 --uninstall。")
        elif not fully_removed:
            print(f"[!] 插件已停用，但目录尚有文件被占用: {plugin_dir}，彻底退出 Antigravity 后即可删除。")
        else:
            print("[✓] obsidian-prism 已彻底卸载。")
        return

    if node_major >= 22:
        sync_source_repo(repo_dir)
        print("[*] 正在执行原生插件部署 (install-plugin.cjs --install)...")
        run_plugin_script(repo_dir, "install")
    elif sys.platform == "win32":
        install_via_release_exe()
    else:
        print("[错误] 当前平台需要 Node.js >= 22.0.0 才能通过源码部署 obsidian-prism。")
        sys.exit(1)

    print("\n" + "=" * 64)
    print("  Obsidian Prism 安装/更新完成！")
    print("  共存提醒：")
    print("  1. 本插件自带 512K 玻璃瓶与额度面板，如与 agy-capsule 重叠可按需关闭其一；")
    print("  2. 请勿手动运行 obsidian-prism 的 clean:legacy，以免清除 app.asar 汉化；")
    print("  3. 若发现 Antigravity 无响应，彻底退出托盘后通过桌面快捷方式重开即可。")
    print("=" * 64)


if __name__ == "__main__":
    main()
