#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
One-click installer & CDP shortcut fixer for Lumidarin/agy-capsule.
自动拉取官方 Lumidarin/agy-capsule 额度查看插件并修复桌面/开始菜单/任务栏快捷方式的 CDP 端口参数。
"""

import os
import shutil
import subprocess
import sys
import tempfile
import urllib.request
import zipfile

CAPSULE_ZIP_URL = "https://github.com/Lumidarin/agy-capsule/archive/refs/heads/main.zip"
CAPSULE_GIT_URL = "https://github.com/Lumidarin/agy-capsule.git"

SHORTCUT_FIX_PS = r"""
$ErrorActionPreference = 'SilentlyContinue'
$dirs = @(
  [Environment]::GetFolderPath('Desktop'),
  [Environment]::GetFolderPath('CommonDesktopDirectory'),
  [Environment]::GetFolderPath('StartMenu'),
  [Environment]::GetFolderPath('CommonStartMenu'),
  (Join-Path $env:APPDATA 'Microsoft\Internet Explorer\Quick Launch\User Pinned\TaskBar')
) | Where-Object { $_ -and (Test-Path -LiteralPath $_) } | Select-Object -Unique
$pattern = '(^|\s)--remote-debugging-port(=\S*)?(?=\s|$)'
$shell = New-Object -ComObject WScript.Shell
$total = 0; $updated = 0; $already = 0
foreach ($d in $dirs) {
  foreach ($f in Get-ChildItem -LiteralPath $d -Recurse -Filter *.lnk) {
    $l = $shell.CreateShortcut($f.FullName)
    if ($l.TargetPath -and (Split-Path -Leaf $l.TargetPath) -eq 'Antigravity.exe') {
      $total++
      $args = [string]$l.Arguments
      if ($args -match $pattern) {
        $already++
        continue
      }
      $l.Arguments = "$args --remote-debugging-port=0".Trim()
      $l.Save()
      $updated++
    }
  }
}
Write-Output "$total,$updated,$already"
"""


def download_or_clone_capsule(work_dir):
    # Prefer git if available, fallback to ZIP download
    try:
        git_chk = subprocess.run(["git", "--version"], capture_output=True, text=True)
        if git_chk.returncode == 0:
            repo_dir = os.path.join(work_dir, "agy-capsule")
            print("[*] 正在从 GitHub 拉取官方 Lumidarin/agy-capsule ...")
            subprocess.run(["git", "clone", "--depth", "1", CAPSULE_GIT_URL, repo_dir], check=True)
            return repo_dir
    except Exception:
        pass

    zip_path = os.path.join(work_dir, "agy-capsule.zip")
    print("[*] 正在从 GitHub 下载官方 Lumidarin/agy-capsule 压缩包...")
    req = urllib.request.Request(CAPSULE_ZIP_URL, headers={"User-Agent": "agy-chinese/1.0"})
    with urllib.request.urlopen(req, timeout=30) as resp, open(zip_path, "wb") as out:
        shutil.copyfileobj(resp, out)
    with zipfile.ZipFile(zip_path, "r") as zf:
        zf.extractall(work_dir)
    repo_dir = os.path.join(work_dir, "agy-capsule-main")
    if not os.path.exists(repo_dir):
        raise RuntimeError("解压后的目录结构异常，未找到 agy-capsule-main。")
    return repo_dir


def main():
    print("=" * 64)
    print("  agy-capsule 额度查看插件一键安装与防失效修复工具")
    print("  官方仓库: https://github.com/Lumidarin/agy-capsule")
    print("=" * 64)

    if sys.platform != "win32":
        print("[!] 非 Windows 系统请直接从官方仓库运行 sh install.sh。")
        sys.exit(1)

    work_dir = tempfile.mkdtemp(prefix="agy_capsule_inst_")
    try:
        repo_dir = download_or_clone_capsule(work_dir)
        manage_ps1 = os.path.join(repo_dir, "scripts", "manage-plugin.ps1")
        if not os.path.exists(manage_ps1):
            print("[错误] 未在下载包中找到 scripts/manage-plugin.ps1。")
            sys.exit(1)

        print("[*] 正在安装 / 更新 agy-capsule 插件...")
        subprocess.run(
            ["powershell.exe", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", manage_ps1, "-Action", "install"],
            check=True,
        )
        print("[✓] agy-capsule 插件文件已安装完成。")

        print("[*] 正在检查并修复桌面 / 开始菜单 / 任务栏 Antigravity 快捷方式 CDP 参数...")
        res = subprocess.run(
            ["powershell.exe", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", SHORTCUT_FIX_PS],
            capture_output=True,
            text=True,
            check=True,
        )
        line = res.stdout.strip().splitlines()[-1] if res.stdout.strip() else "0,0,0"
        total, updated, already = line.split(",")
        print(f"[✓] 快捷方式检查完成：共扫描 {total} 个，已配置 {already} 个，本次新修复 {updated} 个。")
        print("\n" + "=" * 64)
        print("  agy-capsule 安装与快捷方式修复成功！")
        print("  彻底退出 Antigravity（含系统托盘）后重开，或直接使用")
        print("  [启动Antigravity(自动检查汉化).bat] 启动即可稳定生效。")
        print("=" * 64)
    finally:
        shutil.rmtree(work_dir, ignore_errors=True)


if __name__ == "__main__":
    main()
